using Dapper;
using CRM.Api.Data;
using CRM.Api.DTOs;
using System.Data;
using System.Text.Json;

namespace CRM.Api.Services;

public class MetaService
{
    private readonly CrmDbContext _db;
    private readonly ILogger<MetaService> _logger;

    public MetaService(CrmDbContext db, ILogger<MetaService> logger)
    {
        _db     = db;
        _logger = logger;
    }

    // ─── LECTURA ────────────────────────────────────────────────────────────

    /// <summary>Obtiene todos los años con metas configuradas.</summary>
    public async Task<IEnumerable<int>> GetAniosConMetaAsync()
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<int>(
            "SELECT Anio FROM CRM.MetaAnual WHERE Activo = 1 ORDER BY Anio DESC");
    }

    /// <summary>Detalle completo de meta para un año: empresa + consultores.</summary>
    public async Task<MetaAnualDto?> GetMetaAnualAsync(int anio)
    {
        using var conn = _db.CreateConnection();

        // Cabecera
        var meta = await conn.QueryFirstOrDefaultAsync<dynamic>(
            "SELECT IdMetaAnual, Anio, MetaTotalAnual, Descripcion, Activo FROM CRM.MetaAnual WHERE Anio = @Anio AND Activo = 1",
            new { Anio = anio });

        if (meta is null) return null;

        int idMeta = (int)meta.IdMetaAnual;

        // Distribución mensual empresa (de la vista)
        var distMensual = await conn.QueryAsync<DistribucionMensualDto>(@"
            SELECT IdMes, NombreMes, PorcentajeMes, MetaMensual, MetaEscalera, MesesRestantes
            FROM   CRM.VW_MetaMensualEmpresa
            WHERE  IdMetaAnual = @IdMetaAnual
            ORDER  BY IdMes",
            new { IdMetaAnual = idMeta });

        // Meta por consultor con meses (de la vista)
        var rawConsultores = await conn.QueryAsync<dynamic>(@"
            SELECT IdConsultor, NombreConsultor, PorcentajeConsultor, MetaAnualConsultor,
                   IdMes, NombreMes, MetaMensual, MetaEscalera
            FROM   CRM.VW_MetaMensualConsultor
            WHERE  IdMetaAnual = @IdMetaAnual
            ORDER  BY IdConsultor, IdMes",
            new { IdMetaAnual = idMeta });

        // Agrupar por consultor
        var consultoresDict = new Dictionary<int, MetaConsultorDto>();
        foreach (var row in rawConsultores)
        {
            int idCons = (int)row.IdConsultor;
            if (!consultoresDict.TryGetValue(idCons, out var dto))
            {
                dto = new MetaConsultorDto
                {
                    IdConsultor         = idCons,
                    NombreConsultor     = (string)row.NombreConsultor,
                    PorcentajeConsultor = (decimal)row.PorcentajeConsultor,
                    MetaAnualConsultor  = (decimal)row.MetaAnualConsultor,
                };
                consultoresDict[idCons] = dto;
            }
            dto.MetasMensuales.Add(new MetaMensualConsultorDto
            {
                IdMes       = (int)row.IdMes,
                NombreMes   = (string)row.NombreMes,
                MetaMensual = (decimal)row.MetaMensual,
                MetaEscalera= (decimal)row.MetaEscalera,
            });
        }

        return new MetaAnualDto
        {
            IdMetaAnual         = idMeta,
            Anio                = (int)meta.Anio,
            MetaTotalAnual      = (decimal)meta.MetaTotalAnual,
            Descripcion         = (string?)meta.Descripcion,
            Activo              = (bool)meta.Activo,
            DistribucionMensual = distMensual.ToList(),
            MetasConsultores    = consultoresDict.Values.ToList(),
        };
    }

    /// <summary>Resumen compacto para el dashboard: mes actual + escalera.</summary>
    public async Task<ResumenMetaDto?> GetResumenMetaAsync(int anio)
    {
        using var conn = _db.CreateConnection();
        int mesActual = DateTime.Today.Month;

        var empresa = await conn.QueryFirstOrDefaultAsync<dynamic>(@"
            SELECT MetaTotalAnual, IdMes, NombreMes, MetaMensual, MetaEscalera
            FROM   CRM.VW_MetaMensualEmpresa
            WHERE  IdMetaAnual = (SELECT IdMetaAnual FROM CRM.MetaAnual WHERE Anio = @Anio AND Activo = 1)
              AND  IdMes = @Mes",
            new { Anio = anio, Mes = mesActual });

        if (empresa is null) return null;

        var consultores = await conn.QueryAsync<dynamic>(@"
            SELECT IdConsultor, NombreConsultor, MetaMensual, MetaEscalera, MetaAnualConsultor
            FROM   CRM.VW_MetaMensualConsultor
            WHERE  IdMetaAnual = (SELECT IdMetaAnual FROM CRM.MetaAnual WHERE Anio = @Anio AND Activo = 1)
              AND  IdMes = @Mes",
            new { Anio = anio, Mes = mesActual });

        return new ResumenMetaDto
        {
            Anio            = anio,
            MetaTotalAnual  = (decimal)empresa.MetaTotalAnual,
            MesActual       = mesActual,
            NombreMesActual = (string)empresa.NombreMes,
            MetaMesActual   = (decimal)empresa.MetaMensual,
            MetaEscalera    = (decimal)empresa.MetaEscalera,
            PorConsultor    = consultores.Select(c => new ResumenMetaConsultorDto
            {
                IdConsultor     = (int)c.IdConsultor,
                NombreConsultor = (string)c.NombreConsultor,
                MetaMes         = (decimal)c.MetaMensual,
                MetaEscalera    = (decimal)c.MetaEscalera,
                MetaAnual       = (decimal)c.MetaAnualConsultor,
            }).ToList()
        };
    }

    // ─── ESCRITURA ───────────────────────────────────────────────────────────

    /// <summary>Crea o actualiza la meta anual + distribución mensual.</summary>
    public async Task<int> GuardarMetaAnualAsync(GuardarMetaAnualRequest req, string usuario)
    {
        if (req.PorcentajesMensuales.Count != 12)
            throw new ArgumentException("Debe proporcionar exactamente 12 porcentajes mensuales.");

        var suma = req.PorcentajesMensuales.Sum();
        if (Math.Abs(suma - 1m) > 0.001m)
            throw new ArgumentException($"Los porcentajes mensuales suman {suma:P2}, deben sumar 100%.");

        using var conn = _db.CreateConnection();
        var p = req.PorcentajesMensuales;

        var result = await conn.QueryFirstAsync<int>(
            "CRM.SP_GuardarMetaAnual",
            new
            {
                Anio           = req.Anio,
                MetaTotalAnual = req.MetaTotalAnual,
                Descripcion    = req.Descripcion,
                PctEne = p[0],  PctFeb = p[1],  PctMar = p[2],
                PctAbr = p[3],  PctMay = p[4],  PctJun = p[5],
                PctJul = p[6],  PctAgo = p[7],  PctSep = p[8],
                PctOct = p[9],  PctNov = p[10], PctDic = p[11],
            },
            commandType: CommandType.StoredProcedure);

        _logger.LogInformation("MetaAnual guardada: Año={A} Meta={M} / {U}", req.Anio, req.MetaTotalAnual, usuario);
        return result;
    }

    /// <summary>Guarda (reemplaza) la distribución de % por consultor para un año.</summary>
    public async Task GuardarMetasConsultoresAsync(GuardarMetasConsultoresRequest req, string usuario)
    {
        var suma = req.Consultores.Sum(c => c.Pct);
        if (Math.Abs(suma - 1m) > 0.001m)
            throw new ArgumentException($"Los porcentajes de consultores suman {suma:P2}, deben sumar 100%.");

        // Las propiedades deben ser camelCase para coincidir con los JSON paths del SP: $.idConsultor, $.pct
        var json = JsonSerializer.Serialize(req.Consultores.Select(c => new { idConsultor = c.IdConsultor, pct = c.Pct }));

        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(
            "CRM.SP_GuardarMetasConsultores",
            new { Anio = req.Anio, JsonData = json },
            commandType: CommandType.StoredProcedure);

        _logger.LogInformation("MetasConsultores guardadas: Año={A} N={N} / {U}", req.Anio, req.Consultores.Count, usuario);
    }
}
