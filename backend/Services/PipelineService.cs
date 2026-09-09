using Dapper;
using CRM.Api.Data;
using CRM.Api.DTOs;

namespace CRM.Api.Services;

/// <summary>
/// Capa de datos para el dashboard de Pipeline e indicadores comerciales.
/// </summary>
public class PipelineService
{
    private readonly CrmDbContext _db;

    private static readonly string[] NombresMes =
        ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
         "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

    public PipelineService(CrmDbContext db) => _db = db;

    // ── helper: condición WHERE según filtro ganada/abierta/todas ──────────
    private static string FiltroWhere(string? filtro) => filtro?.ToLower() switch
    {
        "ganada"  => "AND TipoCierre = 'GANADA'",
        "abierta" => "AND TipoCierre IS NULL",
        _         => ""                            // "todas" o null
    };

    // ─────────────────────────────────────────────────────────────────────────
    //  RESUMEN — KPIs
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<PipelineResumenDto> GetResumenAsync(int anio)
    {
        using var conn = _db.CreateConnection();
        var row = await conn.QueryFirstAsync(@"
            SELECT
                COUNT(*)                                                                AS Total,
                SUM(CASE WHEN TipoCierre IS NULL                    THEN 1 ELSE 0 END) AS Activas,
                SUM(CASE WHEN TipoCierre = 'GANADA'                 THEN 1 ELSE 0 END) AS Ganadas,
                SUM(CASE WHEN TipoCierre = 'PERDIDA'                THEN 1 ELSE 0 END) AS Perdidas,
                SUM(CASE WHEN TipoCierre IS NULL                    THEN ValorMensual   ELSE 0 END) AS ValorActivo,
                SUM(CASE WHEN TipoCierre = 'GANADA'                 THEN ValorMensual   ELSE 0 END) AS ValorGanado,
                SUM(CASE WHEN TipoCierre = 'PERDIDA'                THEN ValorMensual   ELSE 0 END) AS ValorPerdido,
                SUM(CASE WHEN TipoCierre IS NULL                    THEN ValorPonderado ELSE 0 END) AS ValorPonderado
            FROM CRM.VW_OportunidadesActuales
            WHERE AnioRegistro = @Anio", new { Anio = anio });

        int ganadas  = (int)row.Ganadas;
        int perdidas = (int)row.Perdidas;
        int cerradas = ganadas + perdidas;
        decimal valGanado  = (decimal)(row.ValorGanado  ?? 0);
        decimal valPerdido = (decimal)(row.ValorPerdido ?? 0);
        decimal valCerrado = valGanado + valPerdido;

        return new PipelineResumenDto
        {
            Anio                = anio,
            TotalOportunidades  = (int)row.Total,
            Activas             = (int)row.Activas,
            Ganadas             = ganadas,
            Perdidas            = perdidas,
            ValorPipelineActivo = (decimal)(row.ValorActivo    ?? 0),
            ValorGanado         = valGanado,
            ValorPonderado      = (decimal)(row.ValorPonderado ?? 0),
            WinRatePorCantidad  = cerradas > 0 ? Math.Round((decimal)ganadas / cerradas * 100, 1) : 0,
            WinRatePorValor     = valCerrado > 0 ? Math.Round(valGanado / valCerrado * 100, 1) : 0
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  FUNNEL
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<IEnumerable<PorFaseDto>> GetPorFaseAsync(int anio)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<PorFaseDto>(@"
            SELECT
                FaseVenta,
                OrdenFunnel,
                ProbabilidadVenta          AS PorcentajeProbabilidad,
                EsCierre,
                TipoCierre,
                COUNT(*)                   AS Cantidad,
                SUM(ValorMensual)          AS ValorMensualTotal,
                SUM(MontoTotalDuracion)    AS MontoTotalDuracion,
                SUM(ValorPonderado)        AS ValorPonderado
            FROM CRM.VW_OportunidadesActuales
            WHERE AnioRegistro = @Anio
            GROUP BY FaseVenta, OrdenFunnel, ProbabilidadVenta, EsCierre, TipoCierre
            ORDER BY OrdenFunnel", new { Anio = anio });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  POR CONSULTOR
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<IEnumerable<PorConsultorDto>> GetPorConsultorAsync(int anio)
    {
        using var conn = _db.CreateConnection();
        var rows = await conn.QueryAsync(@"
            SELECT
                ConsultorActual                                                             AS Consultor,
                SUM(CASE WHEN TipoCierre IS NULL     THEN 1 ELSE 0 END)                    AS OpsActivas,
                SUM(CASE WHEN TipoCierre = 'GANADA'  THEN 1 ELSE 0 END)                    AS OpsGanadas,
                SUM(CASE WHEN TipoCierre = 'PERDIDA' THEN 1 ELSE 0 END)                    AS OpsPerdidas,
                SUM(CASE WHEN TipoCierre IS NULL     THEN ValorMensual ELSE 0 END)          AS ValorPipeline,
                SUM(CASE WHEN TipoCierre = 'GANADA'  THEN ValorMensual ELSE 0 END)          AS ValorGanado
            FROM CRM.VW_OportunidadesActuales
            WHERE AnioRegistro = @Anio
            GROUP BY ConsultorActual
            ORDER BY ValorGanado DESC, ValorPipeline DESC", new { Anio = anio });

        return rows.Select(r =>
        {
            int g = (int)r.OpsGanadas, p = (int)r.OpsPerdidas, c = g + p;
            return new PorConsultorDto
            {
                Consultor     = (string)r.Consultor,
                OpsActivas    = (int)r.OpsActivas,
                OpsGanadas    = g,
                OpsPerdidas   = p,
                ValorPipeline = (decimal)(r.ValorPipeline ?? 0),
                ValorGanado   = (decimal)(r.ValorGanado   ?? 0),
                WinRate       = c > 0 ? Math.Round((decimal)g / c * 100, 1) : 0
            };
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EVOLUCIÓN MENSUAL
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<IEnumerable<EvolucionMensualDto>> GetEvolucionMensualAsync(int anio)
    {
        using var conn = _db.CreateConnection();
        var rows = await conn.QueryAsync(@"
            SELECT
                MONTH(FechaPrimerRegistro)                                          AS Mes,
                COUNT(*)                                                            AS Nuevas,
                SUM(CASE WHEN TipoCierre = 'GANADA'  THEN 1 ELSE 0 END)            AS Ganadas,
                SUM(CASE WHEN TipoCierre = 'PERDIDA' THEN 1 ELSE 0 END)            AS Perdidas,
                SUM(ValorMensual)                                                   AS ValorNuevo,
                SUM(CASE WHEN TipoCierre = 'GANADA'  THEN ValorMensual ELSE 0 END) AS ValorGanado
            FROM CRM.VW_OportunidadesActuales
            WHERE AnioRegistro = @Anio
            GROUP BY MONTH(FechaPrimerRegistro)
            ORDER BY Mes", new { Anio = anio });

        var dict = rows.ToDictionary(r => (int)r.Mes);
        return Enumerable.Range(1, 12).Select(m =>
        {
            bool found = dict.TryGetValue(m, out var r);
            return new EvolucionMensualDto
            {
                Mes                 = m,
                NombreMes           = NombresMes[m - 1],
                NuevasOportunidades = found ? (int)r!.Nuevas    : 0,
                Ganadas             = found ? (int)r!.Ganadas   : 0,
                Perdidas            = found ? (int)r!.Perdidas  : 0,
                ValorNuevo          = found ? (decimal)(r!.ValorNuevo  ?? 0) : 0,
                ValorGanado         = found ? (decimal)(r!.ValorGanado ?? 0) : 0
            };
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  POR SERVICIO — con filtro ganada / abierta / todas
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<IEnumerable<PorServicioDto>> GetPorServicioAsync(int anio, string? filtro = null)
    {
        using var conn = _db.CreateConnection();
        var condFiltro = FiltroWhere(filtro);

        var rows = await conn.QueryAsync($@"
            SELECT
                Servicio,
                COUNT(*)          AS Cantidad,
                SUM(ValorMensual) AS ValorTotal
            FROM CRM.VW_OportunidadesActuales
            WHERE AnioRegistro = @Anio
              {condFiltro}
            GROUP BY Servicio
            ORDER BY ValorTotal DESC
            OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY", new { Anio = anio });

        var lista = rows.ToList();
        decimal gran = lista.Sum(r => (decimal)(r.ValorTotal ?? 0));
        return lista.Select(r => new PorServicioDto
        {
            Servicio   = (string)r.Servicio,
            Cantidad   = (int)r.Cantidad,
            ValorTotal = (decimal)(r.ValorTotal ?? 0),
            Porcentaje = gran > 0 ? Math.Round((decimal)(r.ValorTotal ?? 0) / gran * 100, 1) : 0
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  POR MODALIDAD
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<IEnumerable<PorModalidadDto>> GetPorModalidadAsync(int anio)
    {
        using var conn = _db.CreateConnection();
        var rows = await conn.QueryAsync(@"
            -- [v5] ISNULL: las oportunidades creadas en fase de Contacto aún no
            -- tienen modalidad. Sin esto se agrupaban bajo una etiqueta vacía.
            SELECT
                ISNULL(ModalidadContrato, 'SIN MODALIDAD') AS Modalidad,
                COUNT(*)          AS Cantidad,
                SUM(ValorMensual) AS ValorTotal
            FROM CRM.VW_OportunidadesActuales
            WHERE AnioRegistro = @Anio
            GROUP BY ISNULL(ModalidadContrato, 'SIN MODALIDAD')
            ORDER BY ValorTotal DESC", new { Anio = anio });

        var lista = rows.ToList();
        decimal gran = lista.Sum(r => (decimal)(r.ValorTotal ?? 0));
        return lista.Select(r => new PorModalidadDto
        {
            Modalidad  = (string)r.Modalidad,
            Cantidad   = (int)r.Cantidad,
            ValorTotal = (decimal)(r.ValorTotal ?? 0),
            Porcentaje = gran > 0 ? Math.Round((decimal)(r.ValorTotal ?? 0) / gran * 100, 1) : 0
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  PRÓXIMOS A VENCER
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<IEnumerable<ProximoAVencerDto>> GetProximosAVencerAsync(int dias = 60)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<ProximoAVencerDto>(@"
            SELECT TOP 20
                NumeroCotizacion,
                ProspectoCliente             AS Cliente,
                ConsultorActual              AS Consultor,
                FaseVenta,
                ValorMensual,
                ProbabilidadVenta,
                MesFin,
                FechaFinServicio,
                DATEDIFF(DAY, CAST(GETDATE() AS DATE), FechaFinServicio) AS DiasRestantes
            FROM CRM.VW_OportunidadesActuales
            WHERE TipoCierre IS NULL
              AND FechaFinServicio IS NOT NULL
              AND FechaFinServicio <= DATEADD(DAY, @Dias, CAST(GETDATE() AS DATE))
            ORDER BY FechaFinServicio ASC", new { Dias = dias });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  TOP CLIENTES — con filtro ganada / abierta / todas
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<IEnumerable<TopClienteDto>> GetTopClientesAsync(int anio, int top = 10, string? filtro = null)
    {
        using var conn = _db.CreateConnection();
        var condFiltro = FiltroWhere(filtro);

        return await conn.QueryAsync<TopClienteDto>($@"
            SELECT TOP {top}
                ProspectoCliente                                                        AS Cliente,
                MAX(Nit)                                                                AS Nit,
                COUNT(*)                                                                AS Oportunidades,
                SUM(CASE WHEN TipoCierre = 'GANADA' THEN 1 ELSE 0 END)                 AS Ganadas,
                SUM(ValorMensual)                                                       AS ValorPipeline,
                SUM(CASE WHEN TipoCierre = 'GANADA' THEN ValorMensual ELSE 0 END)       AS ValorGanado
            FROM CRM.VW_OportunidadesActuales
            WHERE AnioRegistro = @Anio
              {condFiltro}
            GROUP BY ProspectoCliente
            ORDER BY ValorPipeline DESC", new { Anio = anio });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  POR REGIÓN — con filtro ganada / abierta / todas
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<IEnumerable<PorRegionDto>> GetPorRegionAsync(int anio, string? filtro = null)
    {
        using var conn = _db.CreateConnection();
        var condFiltro = FiltroWhere(filtro);

        var rows = await conn.QueryAsync($@"
            SELECT
                Region,
                COUNT(*)          AS Cantidad,
                SUM(ValorMensual) AS ValorTotal
            FROM CRM.VW_OportunidadesActuales
            WHERE AnioRegistro = @Anio
              {condFiltro}
            GROUP BY Region
            ORDER BY ValorTotal DESC", new { Anio = anio });

        var lista = rows.ToList();
        decimal gran = lista.Sum(r => (decimal)(r.ValorTotal ?? 0));
        return lista.Select(r => new PorRegionDto
        {
            Region     = (string)(r.Region ?? "Sin región"),
            Cantidad   = (int)r.Cantidad,
            ValorTotal = (decimal)(r.ValorTotal ?? 0),
            Porcentaje = gran > 0 ? Math.Round((decimal)(r.ValorTotal ?? 0) / gran * 100, 1) : 0
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  FORECAST — Modelo de cohortes MRR con corte anual estricto
    //
    //  REGLAS FIJAS (no son filtros de usuario):
    //  • Solo contratos con TipoCierre = 'GANADA'
    //  • Solo TipoCliente IN ('NUEVO', 'PROFUNDIZACION') — venta real, no renovación
    //
    //  FILTRO DE USUARIO:
    //  • @Consultor: si se suministra, filtra por ConsultorActual
    // ─────────────────────────────────────────────────────────────────────────
    /// <summary>
    /// [v7] Años que el selector "Año de corte" debe ofrecer. Es la unión de:
    ///   · años en los que un contrato factura (incluye los años futuros que
    ///     alcanza un contrato multianual, vía CRM.VW_ContratoCorteAnual)
    ///   · años con movimientos registrados
    ///   · años con meta comercial configurada
    ///   · el año en curso del SERVIDOR (no el del PC del usuario)
    /// Así un contrato que arranca en 2027 aparece en cuanto se registra, y un
    /// año con historia no desaparece del selector al pasar el tiempo.
    /// </summary>
    public async Task<IEnumerable<int>> GetAniosDisponiblesAsync()
    {
        using var conn = _db.CreateConnection();

        return await conn.QueryAsync<int>(@"
            SELECT DISTINCT Anio FROM (
                SELECT Anio                    FROM CRM.VW_ContratoCorteAnual
                UNION ALL
                SELECT AnioInicio              FROM CRM.VW_ContratoCorteAnual
                UNION ALL
                SELECT AnioRegistro            FROM CRM.VW_OportunidadesActuales
                UNION ALL
                SELECT Anio                    FROM CRM.MetaAnual WHERE Activo = 1
                UNION ALL
                SELECT YEAR(GETDATE())
            ) AS a
            WHERE Anio BETWEEN 2020 AND 2050
            ORDER BY Anio DESC");
    }

    public async Task<ForecastDto> GetForecastAsync(int anio, string? consultor = null)
    {
        using var conn = _db.CreateConnection();

        // [v6] FUENTE ÚNICA DEL CORTE ANUAL: CRM.VW_ContratoCorteAnual.
        //
        // Antes esta consulta calculaba el mes final con IdMesFin, que es una
        // columna módulo-12 SIN año. Para cualquier contrato que cruzara
        // diciembre el mes final quedaba ANTES del inicial (junio + 24 meses
        // → IdMesFin = 5 = MAYO), el ciclo de meses no se ejecutaba ni una vez
        // y la venta aportaba $0: desaparecía del cuadro de mando aunque
        // estuviera correctamente guardada en la base.
        //
        // La vista ya entrega el tramo recortado al año (MesInicioAnio,
        // MesFinAnio) y cuántos meses se salen hacia adelante.
        var contratos = await conn.QueryAsync(@"
            SELECT
                MesInicioAnio     AS MesCohorte,
                MesInicioAnio     AS MesInicio,
                MesFinAnio        AS MesFinClip,
                MesesFueraDelAnio,
                ValorMensual,
                ConsultorActual,
                CASE WHEN UPPER(ModalidadContrato) LIKE 'FIJ%' THEN 1 ELSE 0 END AS EsFijo
            FROM CRM.VW_ContratoCorteAnual
            WHERE Anio        = @Anio
              AND AnioInicio  = @Anio        -- escalera = ventas nuevas de este año
              AND TipoCierre  = 'GANADA'
              AND UPPER(TipoCliente) IN ('NUEVO', 'PROFUNDIZACION')
              AND (@Consultor IS NULL OR ConsultorActual = @Consultor)",
            new { Anio = anio, Consultor = string.IsNullOrWhiteSpace(consultor) ? null : consultor.Trim() });

        var listaContratos = contratos.ToList();

        // Lista de consultores únicos presentes en el año (para el dropdown)
        var consultoresAnio = await conn.QueryAsync<string>(@"
            SELECT DISTINCT ConsultorActual
            FROM CRM.VW_ContratoCorteAnual
            WHERE Anio       = @Anio
              AND AnioInicio = @Anio
              AND TipoCierre = 'GANADA'
              AND UPPER(TipoCliente) IN ('NUEVO', 'PROFUNDIZACION')
            ORDER BY ConsultorActual", new { Anio = anio });

        var celdas  = new decimal[12, 12];
        var celdasF = new decimal[12, 12];
        var celdasO = new decimal[12, 12];

        int cantContratos = 0, totalMesesPerdidos = 0;
        decimal valorMesesPerdidos = 0;

        foreach (var c in listaContratos)
        {
            cantContratos++;
            int cohort  = (int)c.MesCohorte - 1;
            int mesIni  = (int)c.MesInicio;
            int mesFinC = (int)c.MesFinClip;
            decimal vm  = (decimal)(c.ValorMensual ?? 0);
            bool esFijo = (int)c.EsFijo == 1;

            for (int m = mesIni; m <= mesFinC; m++)
            {
                celdas[cohort, m - 1]  += vm;
                if (esFijo) celdasF[cohort, m - 1] += vm;
                else        celdasO[cohort, m - 1] += vm;
            }

            // [v6] Meses que se salen del año de corte: ya vienen calculados.
            int perdidos = (int)c.MesesFueraDelAnio;
            totalMesesPerdidos += perdidos;
            valorMesesPerdidos += perdidos * vm;
        }

        var filas         = new List<ForecastFilaDto>();
        var totalesMes    = new decimal[12];
        var totalesMesFij = new decimal[12];
        var totalesMesOca = new decimal[12];
        var ventaNueva    = new decimal[12];
        var ventaNuevaF   = new decimal[12];   // diagonal FIJO
        var ventaNuevaO   = new decimal[12];   // diagonal OCASIONAL

        for (int cohort = 0; cohort < 12; cohort++)
        {
            bool tieneDatos = false;
            for (int m = 0; m < 12; m++)
                if (celdas[cohort, m] > 0) { tieneDatos = true; break; }
            if (!tieneDatos) continue;

            var fila = new ForecastFilaDto
            {
                MesCohorte  = cohort + 1,
                NombreMes   = NombresMes[cohort],
                Valores     = new decimal[12],
                ValoresFijo = new decimal[12],
                ValoresOcas = new decimal[12]
            };

            for (int m = 0; m < 12; m++)
            {
                fila.Valores[m]     = celdas[cohort, m];
                fila.ValoresFijo[m] = celdasF[cohort, m];
                fila.ValoresOcas[m] = celdasO[cohort, m];
                fila.TotalFila     += celdas[cohort, m];
                totalesMes[m]      += celdas[cohort, m];
                totalesMesFij[m]   += celdasF[cohort, m];
                totalesMesOca[m]   += celdasO[cohort, m];
            }

            ventaNueva[cohort]  = celdas[cohort, cohort];
            ventaNuevaF[cohort] = celdasF[cohort, cohort];
            ventaNuevaO[cohort] = celdasO[cohort, cohort];
            fila.MesesActivos  = Enumerable.Range(0, 12).Count(m => celdas[cohort, m] > 0);
            filas.Add(fila);
        }

        return new ForecastDto
        {
            Anio                  = anio,
            Filas                 = filas,
            TotalesMensuales      = totalesMes,
            TotalesMensualesFijo  = totalesMesFij,
            TotalesMensualesOcas  = totalesMesOca,
            VentaNuevaMes         = ventaNueva,
            GranTotal             = totalesMes.Sum(),
            GranTotalFijo         = totalesMesFij.Sum(),
            GranTotalOcas         = totalesMesOca.Sum(),
            CantidadContratos     = cantContratos,
            TotalMesesPerdidos    = totalMesesPerdidos,
            ValorMesesPerdidos    = valorMesesPerdidos,
            Consultores           = consultoresAnio.ToList(),
            VentaNuevaMesFijo     = ventaNuevaF,
            VentaNuevaMesOcas     = ventaNuevaO
        };
    }
    // ─────────────────────────────────────────────────────────────────────────
    //  AIU — Análisis de Rentabilidad mensual
    //
    //  Reglas fijas (no son filtros de usuario):
    //  • TipoCierre = 'GANADA'
    //  • TipoCliente IN ('NUEVO', 'PROFUNDIZACION')
    //
    //  Agrupación por MES DE INICIO del servicio:
    //  • MONTH(ISNULL(FechaInicioServicio, FechaPrimerRegistro))
    //
    //  Fórmula: % AIU = ((SUM(ValorMensual) - SUM(Costo)) / SUM(MontoTotalDuracion)) * 100
    //
    //  @mes: 1-12 → filtra por ese mes específico (KPIs del mes); null/0 → resumen anual
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<AiuResumenDto> GetAiuAsync(int anio, int? mes = null)
    {
        using var conn = _db.CreateConnection();

        // [v6] Se consulta CRM.VW_ContratoCorteAnual — la misma fuente que el
        // forecast — para que "TOTAL AÑO DE CORTE" y la escalera nunca puedan
        // discrepar. La vista ya recorta cada contrato al año consultado.
        const string baseWhere = @"
            Anio        = @Anio
            AND AnioInicio  = @Anio
            AND TipoCierre  = 'GANADA'
            AND UPPER(TipoCliente) IN ('NUEVO', 'PROFUNDIZACION')";

        // Datos mensuales completos (siempre los 12 meses para la tabla)
        var rowsMes = await conn.QueryAsync($@"
            SELECT
                MesInicioAnio                        AS Mes,
                COUNT(*)                             AS Cantidad,
                SUM(ValorMensual)                    AS TotalTarifa,
                SUM(Costo)                           AS TotalCosto,
                SUM(ValorEnAnio)                     AS TotalAnioCorte,
                SUM(ValorTotalContrato)              AS TotalCotizacion
            FROM CRM.VW_ContratoCorteAnual
            WHERE {baseWhere}
            GROUP BY MesInicioAnio
            ORDER BY Mes",
            new { Anio = anio });

        var dictMes = rowsMes.ToDictionary(r => (int)r.Mes);

        var mensual = Enumerable.Range(1, 12).Select(m =>
        {
            bool found    = dictMes.TryGetValue(m, out var r);
            decimal tar   = found ? (decimal)(r!.TotalTarifa     ?? 0) : 0;
            decimal cos   = found ? (decimal)(r!.TotalCosto      ?? 0) : 0;
            decimal cot   = found ? (decimal)(r!.TotalCotizacion ?? 0) : 0;
            decimal corte = found ? (decimal)(r!.TotalAnioCorte  ?? 0) : 0;
            decimal aiuAb = tar - cos;
            decimal aiuPc = cot > 0 ? Math.Round(aiuAb / cot * 100, 2) : 0;
            return new AiuMensualDto
            {
                Mes             = m,
                NombreMes       = NombresMes[m - 1],
                Cantidad        = found ? (int)r!.Cantidad : 0,
                TotalTarifa     = tar,
                TotalCosto      = cos,
                TotalCotizacion = cot,
                TotalAnioCorte  = corte,
                AiuAbsoluto     = aiuAb,
                PorcentajeAiu   = aiuPc
            };
        }).ToList();

        // Totales para el período seleccionado (filtro por mes o todo el año)
        var condMes   = (mes.HasValue && mes.Value > 0)
                        ? "AND MesInicioAnio = @Mes"
                        : "";

        var rowTotal  = await conn.QueryFirstAsync($@"
            SELECT
                COUNT(*)                AS Cantidad,
                SUM(ValorMensual)       AS TotalTarifa,
                SUM(Costo)              AS TotalCosto,
                SUM(ValorEnAnio)        AS TotalAnioCorte,
                SUM(ValorTotalContrato) AS TotalCotizacion
            FROM CRM.VW_ContratoCorteAnual
            WHERE {baseWhere}
              {condMes}",
            new { Anio = anio, Mes = mes });

        decimal tTar  = (decimal)(rowTotal.TotalTarifa     ?? 0);
        decimal tCos  = (decimal)(rowTotal.TotalCosto      ?? 0);
        decimal tCot  = (decimal)(rowTotal.TotalCotizacion ?? 0);
        decimal tCorte= (decimal)(rowTotal.TotalAnioCorte  ?? 0);
        decimal tAiuA = tTar - tCos;
        decimal tAiuP = tCot > 0 ? Math.Round(tAiuA / tCot * 100, 2) : 0;

        return new AiuResumenDto
        {
            Anio            = anio,
            MesFiltro       = mes,
            Cantidad        = (int)(rowTotal.Cantidad ?? 0),
            TotalTarifa     = tTar,
            TotalCosto      = tCos,
            TotalCotizacion = tCot,
            TotalAnioCorte  = tCorte,
            AiuAbsoluto     = tAiuA,
            PorcentajeAiu   = tAiuP,
            Mensual         = mensual
        };
    }

    /// <summary>
    /// EFECTIVIDAD DE OFERTAS — mes a mes.
    /// Para cada mes cuenta las oportunidades vigentes con PorcentajeProbabilidad >= 40
    /// y de esas cuántas son VENTA (TipoCierre=GANADA / EsCierre=1).
    /// Efectividad% = (Ventas / TotalMayor40) * 100
    /// </summary>
    /// <summary>
    /// [v10] EFECTIVIDAD DE OFERTAS
    ///
    /// Base de cálculo = oportunidades con probabilidad &gt;= 40%  +  las perdidas
    ///                   (NO ADJUDICADO / NO PRESENTADO).
    /// Numerador       = las que se ganaron.
    ///
    /// Las perdidas se suman aparte porque su fase tiene probabilidad baja y
    /// quedaban fuera del filtro &gt;= 40%: sin ellas el denominador ignoraba las
    /// ofertas que efectivamente se compitieron y se perdieron, e inflaba el
    /// porcentaje. Ejemplo del negocio: 5 ganadas + 4 abiertas al 80% + 1
    /// perdida → base 10, efectividad 50%.
    /// </summary>
    public async Task<IEnumerable<EfectividadMesDto>> GetEfectividadOfertasAsync(int anio, string? consultor)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<EfectividadMesDto>(@"
            SELECT
                df.MesNumero                                                   AS Mes,
                df.NombreMes                                                   AS NombreMes,
                COUNT(*)                                                       AS TotalBase,
                SUM(CASE WHEN oa.TipoCierre = 'GANADA'  THEN 1 ELSE 0 END)     AS TotalVenta,
                SUM(CASE WHEN oa.TipoCierre = 'PERDIDA' THEN 1 ELSE 0 END)     AS TotalPerdida,
                CAST(
                    ROUND(
                        CAST(SUM(CASE WHEN oa.TipoCierre = 'GANADA'
                                      THEN 1 ELSE 0 END) AS FLOAT)
                        / NULLIF(COUNT(*), 0) * 100
                    , 1)
                AS DECIMAL(5,1))                                               AS EfectividadPct
            FROM       CRM.VW_OportunidadesActuales oa
            INNER JOIN CRM.DimFecha df ON df.Fecha = oa.FechaActualizacion
            WHERE  df.Anio = @Anio
              AND  (oa.PorcentajeProbabilidad >= 40 OR oa.TipoCierre = 'PERDIDA')
              AND  (@Consultor IS NULL OR oa.ConsultorActual = @Consultor)
            GROUP BY df.MesNumero, df.NombreMes
            ORDER BY df.MesNumero",
            new { Anio = anio, Consultor = consultor });
    }


}
