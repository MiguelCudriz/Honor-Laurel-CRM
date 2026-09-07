using Dapper;
using CRM.Api.Data;
using CRM.Api.DTOs;
using System.Data;

namespace CRM.Api.Services;

public class OportunidadService
{
    private readonly CrmDbContext _db;
    private readonly ILogger<OportunidadService> _logger;

    public OportunidadService(CrmDbContext db, ILogger<OportunidadService> logger)
    {
        _db     = db;
        _logger = logger;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  CATÁLOGOS
    // ─────────────────────────────────────────────────────────────────────────

    public async Task<IEnumerable<CatalogoItem>> GetTiposClienteAsync()
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<CatalogoItem>(
            "SELECT IdTipoCliente AS Id, Descripcion, Activo FROM CRM.TipoCliente WHERE Activo = 1 ORDER BY Descripcion");
    }

    public async Task<IEnumerable<CatalogoItem>> GetSectoresEconomicosAsync()
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<CatalogoItem>(
            "SELECT IdSectorEconomico AS Id, Descripcion, Activo FROM CRM.SectorEconomico WHERE Activo = 1 ORDER BY Descripcion");
    }

    public async Task<IEnumerable<CatalogoItem>> GetConsultoresAsync()
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<CatalogoItem>(
            "SELECT IdConsultor AS Id, NombreCompleto AS Descripcion, Activo FROM CRM.Consultor WHERE Activo = 1 ORDER BY NombreCompleto");
    }

    public async Task<IEnumerable<CatalogoItem>> GetServiciosAsync()
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<CatalogoItem>(
            "SELECT IdServicio AS Id, Nombre AS Descripcion, Activo FROM CRM.Servicio WHERE Activo = 1 ORDER BY Nombre");
    }

    public async Task<IEnumerable<CatalogoItem>> GetModalidadesAsync()
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<CatalogoItem>(
            "SELECT IdModalidad AS Id, Descripcion, Activo FROM CRM.ModalidadContrato WHERE Activo = 1 ORDER BY Descripcion");
    }

    public async Task<IEnumerable<CatalogoItem>> GetFasesVentaAsync()
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<CatalogoItem>(@"
            SELECT IdFaseVenta AS Id, Descripcion, Activo, OrdenFunnel
            FROM   CRM.FaseVenta
            WHERE  Activo = 1
            ORDER  BY OrdenFunnel");
    }

    /// <summary>
    /// Catálogo de meses del año (CRM.Mes).
    /// [v3.2] Nuevo método — tabla creada en patch_v3_2.
    /// </summary>
    public async Task<IEnumerable<MesItem>> GetMesesAsync()
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<MesItem>(
            "SELECT IdMes, Nombre FROM CRM.Mes ORDER BY IdMes");
    }

    public async Task<IEnumerable<MunicipioItem>> GetMunicipiosAsync(string? filtro = null)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<MunicipioItem>(@"
            SELECT m.IdMunicipio,
                   m.Nombre,
                   d.Nombre AS Departamento,
                   r.Nombre AS Region
            FROM   CRM.Municipio    m
            INNER JOIN CRM.Departamento d ON d.IdDepartamento = m.IdDepartamento
            INNER JOIN CRM.Region       r ON r.IdRegion       = d.IdRegion
            WHERE  m.Activo = 1
              AND  (@Filtro IS NULL OR m.Nombre LIKE '%' + @Filtro + '%'
                    OR d.Nombre LIKE '%' + @Filtro + '%')
            ORDER  BY d.Nombre, m.Nombre",
            new { Filtro = filtro });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  CLIENTE
    // ─────────────────────────────────────────────────────────────────────────

    public async Task<IEnumerable<ClienteItem>> BuscarClientesAsync(string criterio)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<ClienteItem>(@"
            SELECT TOP 20
                   c.IdCliente,
                   c.NIT,
                   c.RazonSocial,
                   se.Descripcion AS SectorEconomico,
                   (SELECT COUNT(*) FROM CRM.Oportunidad op
                    WHERE  op.IdCliente IN (
                               SELECT IdCliente FROM CRM.Cliente c2
                               WHERE  c2.NombreNormalizado = c.NombreNormalizado
                                 AND  c2.Activo = 1
                           )
                      AND  op.Activo = 1) AS OportunidadesActivas
            FROM (
                SELECT c.*,
                       ROW_NUMBER() OVER (
                           PARTITION BY c.NombreNormalizado
                           ORDER BY c.IdCliente ASC
                       ) AS rn
                FROM   CRM.Cliente c
                WHERE  c.Activo = 1
                  AND (c.NIT               LIKE '%' + @Criterio + '%'
                   OR  c.RazonSocial       LIKE '%' + @Criterio + '%'
                   OR  c.NombreNormalizado LIKE '%' + UPPER(REPLACE(@Criterio,' ','')) + '%')
            ) c
            INNER JOIN CRM.SectorEconomico se ON se.IdSectorEconomico = c.IdSectorEconomico
            WHERE  c.rn = 1
            ORDER  BY c.RazonSocial",
            new { Criterio = criterio });
    }

    public async Task<ClienteItem?> BuscarClienteExactoAsync(string? nit, string razonSocial)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryFirstOrDefaultAsync<ClienteItem>(@"
            SELECT TOP 1
                   c.IdCliente,
                   c.NIT,
                   c.RazonSocial,
                   se.Descripcion AS SectorEconomico,
                   (SELECT COUNT(*) FROM CRM.Oportunidad op
                    WHERE op.IdCliente = c.IdCliente AND op.Activo = 1) AS OportunidadesActivas
            FROM   CRM.Cliente            c
            INNER JOIN CRM.SectorEconomico se ON se.IdSectorEconomico = c.IdSectorEconomico
            WHERE  c.Activo = 1
              AND  (
                    (@Nit IS NOT NULL AND c.NIT = @Nit)
                 OR c.NombreNormalizado = UPPER(REPLACE(REPLACE(LTRIM(RTRIM(@Razon)),'.',''),' ',''))
              )
            ORDER BY c.IdCliente ASC",
            new { Nit = nit?.Trim(), Razon = razonSocial.Trim() });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  OPORTUNIDADES — ESCRITURA
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Crea cliente (si no existe), oportunidad y primer movimiento
    /// en una transacción atómica vía SP_CrearOportunidad.
    /// [v3.2] Añadido parámetro @IdMesInicio.
    /// [v3.2] Eliminado @FechaCierreEstimada.
    /// [v3.4] @IdModalidad y @TiempoMeses ahora son opcionales (NULL permitido
    ///        en fases de Contacto — Email/Telefónico).
    /// </summary>
    public async Task<CrearOportunidadResponse> CrearOportunidadAsync(
        CrearOportunidadRequest req, string usuario)
    {
        using var conn = _db.CreateConnection();

        var numeroCot = string.IsNullOrWhiteSpace(req.NumeroCotizacion)
            ? (string?)null
            : req.NumeroCotizacion.ToUpper().Trim();

        var p = new DynamicParameters();
        p.Add("@NIT",                req.Nit,                 DbType.String);
        p.Add("@RazonSocial",         req.RazonSocial,         DbType.String);
        p.Add("@IdSectorEconomico",   req.IdSectorEconomico,   DbType.Int16);
        p.Add("@NumeroCotizacion",    numeroCot,               DbType.String);
        p.Add("@IdConsultor",         req.IdConsultor,         DbType.Int16);
        p.Add("@IdMunicipio",         req.IdMunicipio,         DbType.Int32);
        p.Add("@IdServicio",          req.IdServicio,          DbType.Int16);
        p.Add("@IdModalidad",         req.IdModalidad,         DbType.Byte);    // [v3.4] nullable
        p.Add("@IdTipoCliente",       req.IdTipoCliente,       DbType.Byte);
        p.Add("@EsLicitacion",        req.EsLicitacion,        DbType.Boolean);
        p.Add("@TiempoMeses",         req.TiempoMeses,         DbType.Byte);    // [v3.4] nullable
        p.Add("@IdMesInicio",         req.IdMesInicio,         DbType.Byte);    // [v3.2]
        p.Add("@FechaInicioServicio", req.FechaInicioServicio, DbType.Date);
        p.Add("@FechaFinServicio",    req.FechaFinServicio,    DbType.Date);
        p.Add("@Fecha",               req.Fecha.Date,          DbType.Date);
        p.Add("@IdFaseVenta",         req.IdFaseVenta,         DbType.Byte);
        p.Add("@ValorMensual",        req.ValorMensual,        DbType.Decimal);
        p.Add("@Costo",               req.Costo,               DbType.Decimal);
        p.Add("@Observacion",         req.Observacion,         DbType.String);
        p.Add("@Telefono",            req.Telefono,             DbType.String);
        p.Add("@Correo",              req.Correo,               DbType.String);
        p.Add("@IdOportunidadOut",    dbType: DbType.Int32,    direction: ParameterDirection.Output);

        await conn.ExecuteAsync("CRM.SP_CrearOportunidad", p, commandType: CommandType.StoredProcedure);

        var idGenerado = p.Get<int>("@IdOportunidadOut");

        _logger.LogInformation(
            "Oportunidad creada: Id={Id} / Cotización={Cot} / Fase={Fase} / MesInicio={Mi} / Usuario={U}",
            idGenerado, numeroCot ?? "(sin cotización)", req.IdFaseVenta, req.IdMesInicio, usuario);

        return new CrearOportunidadResponse
        {
            IdOportunidad    = idGenerado,
            NumeroCotizacion = numeroCot
        };
    }

    /// <summary>
    /// Actualiza datos maestros de una oportunidad Y registra un nuevo movimiento.
    /// Llama a CRM.SP_ActualizarOportunidad (v3.2).
    /// Reemplaza al antiguo AsignarNumeroCotizacionAsync (cuyo SP fue eliminado).
    /// </summary>
    public async Task ActualizarOportunidadAsync(ActualizarOportunidadRequest req, string usuario)
    {
        using var conn = _db.CreateConnection();

        var nuevaCot = string.IsNullOrWhiteSpace(req.NuevoNumeroCotizacion)
            ? (string?)null
            : req.NuevoNumeroCotizacion.ToUpper().Trim();

        var p = new DynamicParameters();
        p.Add("@IdOportunidad",          req.IdOportunidad, DbType.Int32);
        p.Add("@NuevoNumeroCotizacion",  nuevaCot,          DbType.String);
        p.Add("@IdMunicipio",            req.IdMunicipio,   DbType.Int32);
        p.Add("@IdMesInicio",            req.IdMesInicio,   DbType.Byte);
        p.Add("@TiempoMeses",            req.TiempoMeses,   DbType.Byte);
        p.Add("@IdServicio",             req.IdServicio,    DbType.Int16);
        p.Add("@IdConsultor",            req.IdConsultor,   DbType.Int16);
        p.Add("@Fecha",                  req.Fecha.Date,    DbType.Date);
        p.Add("@IdFaseVenta",            req.IdFaseVenta,   DbType.Byte);
        p.Add("@ValorMensual",           req.ValorMensual,  DbType.Decimal);
        p.Add("@Costo",                  req.Costo,         DbType.Decimal);
        p.Add("@Observacion",            req.Observacion,   DbType.String);

        await conn.ExecuteAsync(
            "CRM.SP_ActualizarOportunidad", p, commandType: CommandType.StoredProcedure);

        _logger.LogInformation(
            "Oportunidad actualizada: Id={Id} / NuevaCot={Cot} / Fase={F} / Usuario={U}",
            req.IdOportunidad, nuevaCot ?? "(sin cambio)", req.IdFaseVenta, usuario);
    }

    /// <summary>
    /// [v3.3] Registra un movimiento de pipeline Y actualiza datos maestros opcionales
    /// (Nit, IdServicio, IdMunicipio, IdMesInicio, FechaInicioServicio, FechaFinServicio).
    /// [v3.4] Añadido IdModalidad opcional — permite completar la modalidad de
    /// oportunidades creadas en fase de Contacto (sin modalidad asignada).
    /// Todos los campos maestros son opcionales: NULL = sin cambio.
    /// Llama a CRM.SP_ActualizarFaseOportunidad v5.
    /// </summary>
    public async Task ActualizarFaseAsync(ActualizarFaseRequest req, string usuario)
    {
        using var conn = _db.CreateConnection();

        var numeroCot = string.IsNullOrWhiteSpace(req.NumeroCotizacion)
            ? (string?)null
            : req.NumeroCotizacion.ToUpper().Trim();

        var nit = string.IsNullOrWhiteSpace(req.Nit) ? (string?)null : req.Nit.Trim();

        var nuevaCotUpdate = string.IsNullOrWhiteSpace(req.NuevoCotizacion)
            ? (string?)null
            : req.NuevoCotizacion.ToUpper().Trim();

        var p = new DynamicParameters();
        p.Add("@NumeroCotizacion",    numeroCot,               DbType.String);
        p.Add("@IdOportunidad",       req.IdOportunidad,       DbType.Int32);
        p.Add("@IdConsultor",         req.IdConsultor,         DbType.Int16);
        p.Add("@Fecha",               req.Fecha.Date,          DbType.Date);
        p.Add("@IdFaseVenta",         req.IdFaseVenta,         DbType.Byte);
        p.Add("@ValorMensual",        req.ValorMensual,        DbType.Decimal);
        p.Add("@Costo",               req.Costo,               DbType.Decimal);
        p.Add("@Observacion",         req.Observacion,         DbType.String);
        p.Add("@Nit",                 nit,                     DbType.String);
        p.Add("@NuevoCotizacion",     nuevaCotUpdate,          DbType.String);
        p.Add("@TiempoMeses",         req.TiempoMeses,         DbType.Byte);
        p.Add("@IdServicio",          req.IdServicio,          DbType.Int16);
        p.Add("@IdMunicipio",         req.IdMunicipio,         DbType.Int32);
        p.Add("@IdModalidad",         req.IdModalidad,         DbType.Byte);    // [v3.4]
        p.Add("@IdMesInicio",         req.IdMesInicio,         DbType.Byte);
        p.Add("@FechaInicioServicio", req.FechaInicioServicio, DbType.Date);
        p.Add("@FechaFinServicio",    req.FechaFinServicio,    DbType.Date);

        await conn.ExecuteAsync(
            "CRM.SP_ActualizarFaseOportunidad", p, commandType: CommandType.StoredProcedure);

        _logger.LogInformation(
            "Fase actualizada: Cot={Cot} IdOp={Id} Fase={F} Modalidad={Mo} MesInicio={Mi} / Usuario={U}",
            numeroCot ?? "(sin cotización)", req.IdOportunidad, req.IdFaseVenta,
            req.IdModalidad, req.IdMesInicio, usuario);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  OPORTUNIDADES — LECTURA
    // ─────────────────────────────────────────────────────────────────────────

    public async Task<IEnumerable<OportunidadVigenteDto>> GetOportunidadesActualesAsync(
        string? consultor  = null,
        string? fase       = null,
        string? tipoCierre = null)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<OportunidadVigenteDto>(@"
            SELECT *
            FROM   CRM.VW_OportunidadesActuales
            WHERE  (@Consultor  IS NULL OR ConsultorActual = @Consultor)
              AND  (@Fase       IS NULL OR FaseVenta       = @Fase)
              AND  (@TipoCierre IS NULL OR TipoCierre      = @TipoCierre)
            ORDER  BY FechaActualizacion DESC",
            new { Consultor = consultor, Fase = fase, TipoCierre = tipoCierre });
    }

    /// <summary>Busca por NumeroCotizacion. Retorna null si no existe.</summary>
    public async Task<object?> GetDetalleOportunidadAsync(string numeroCotizacion)
    {
        using var conn = _db.CreateConnection();

        var cabecera = await conn.QueryFirstOrDefaultAsync<OportunidadVigenteDto>(
            "SELECT * FROM CRM.VW_OportunidadesActuales WHERE NumeroCotizacion = @Num",
            new { Num = numeroCotizacion.ToUpper().Trim() });

        if (cabecera is null) return null;

        var historial = await conn.QueryAsync(@"
            SELECT IdMovimiento, FaseVenta, OrdenFunnel, PorcentajeProbabilidad,
                   EsCierre, TipoCierre, Consultor, ValorMensual, Costo,
                   AIUAbsoluto, PorcentajeAIU, MontoTotalDuracion, ValorPonderado,
                   FechaActualizacion, MesRegistro, AnioRegistro, Trimestre,
                   EsVigente, Observacion, FechaRegistro, UsuarioRegistro
            FROM   CRM.VW_HistorialOportunidades
            WHERE  NumeroCotizacion = @Num
            ORDER  BY FechaRegistro DESC",
            new { Num = numeroCotizacion.ToUpper().Trim() });

        return new { Cabecera = cabecera, Historial = historial };
    }

    /// <summary>Busca por IdOportunidad — para oportunidades sin NumeroCotizacion.</summary>
    public async Task<object?> GetDetalleOportunidadPorIdAsync(int idOportunidad)
    {
        using var conn = _db.CreateConnection();

        var cabecera = await conn.QueryFirstOrDefaultAsync<OportunidadVigenteDto>(
            "SELECT * FROM CRM.VW_OportunidadesActuales WHERE IdOportunidad = @Id",
            new { Id = idOportunidad });

        if (cabecera is null) return null;

        var historial = await conn.QueryAsync(@"
            SELECT IdMovimiento, FaseVenta, OrdenFunnel, PorcentajeProbabilidad,
                   EsCierre, TipoCierre, Consultor, ValorMensual, Costo,
                   AIUAbsoluto, PorcentajeAIU, MontoTotalDuracion, ValorPonderado,
                   FechaActualizacion, MesRegistro, AnioRegistro, Trimestre,
                   EsVigente, Observacion, FechaRegistro, UsuarioRegistro
            FROM   CRM.VW_HistorialOportunidades
            WHERE  IdOportunidad = @Id
            ORDER  BY FechaRegistro DESC",
            new { Id = idOportunidad });

        return new { Cabecera = cabecera, Historial = historial };
    }

    public async Task<IEnumerable<dynamic>> GetPipelineConsultorAsync()
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync("SELECT * FROM CRM.VW_PipelineConsultor ORDER BY OrdenFunnel");
    }

    public async Task<IEnumerable<dynamic>> GetWinRateAsync(int? anio = null)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync(
            "SELECT * FROM CRM.VW_WinRate WHERE (@Anio IS NULL OR Anio = @Anio) ORDER BY Anio DESC, Trimestre",
            new { Anio = anio });
    }
    /// <summary>
    /// Asigna o corrige el NumeroCotizacion de una oportunidad existente
    /// con un simple UPDATE — sin registrar movimiento de pipeline.
    /// Restaurado en v3.3 porque el endpoint /asignar-cotizacion fue
    /// eliminado en v3.2 pero el frontend aún lo necesita para el
    /// panel de edición de cotización en Actualizar/Consultar.
    /// </summary>
    public async Task AsignarNumeroCotizacionAsync(AsignarCotizacionRequest req, string usuario)
    {
        using var conn = _db.CreateConnection();

        var nuevaCot = string.IsNullOrWhiteSpace(req.NuevoNumeroCotizacion)
            ? (string?)null
            : req.NuevoNumeroCotizacion.ToUpper().Trim();

        var p = new DynamicParameters();
        p.Add("@IdOportunidad",          req.IdOportunidad, DbType.Int32);
        p.Add("@NuevoNumeroCotizacion",  nuevaCot,          DbType.String);

        await conn.ExecuteAsync(@"
            UPDATE CRM.Oportunidad
            SET    NumeroCotizacion = @NuevoNumeroCotizacion
            WHERE  IdOportunidad    = @IdOportunidad
              AND  Activo           = 1
              -- Validar unicidad: solo si se asigna un valor no nulo
              AND  (
                   @NuevoNumeroCotizacion IS NULL
                OR NOT EXISTS (
                       SELECT 1 FROM CRM.Oportunidad
                       WHERE  NumeroCotizacion = @NuevoNumeroCotizacion
                         AND  IdOportunidad   <> @IdOportunidad
                   )
              )",
            p);

        _logger.LogInformation(
            "NumeroCotizacion asignado: Id={Id} → '{Cot}' / Usuario={U}",
            req.IdOportunidad, nuevaCot ?? "(NULL)", usuario);
    }


}
