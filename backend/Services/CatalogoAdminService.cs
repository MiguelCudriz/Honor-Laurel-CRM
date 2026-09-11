using Dapper;
using CRM.Api.Data;
using CRM.Api.DTOs;

namespace CRM.Api.Services;

/// <summary>
/// [v9] CRUD genérico de catálogos.
///
/// Toda la variabilidad entre las ocho tablas vive en <see cref="Catalogos"/>.
/// El SQL se arma con los nombres que salen de esa lista blanca —nunca con
/// texto del cliente— y los VALORES siempre van parametrizados.
/// </summary>
public class CatalogoAdminService
{
    private readonly CrmDbContext _db;
    public CatalogoAdminService(CrmDbContext db) => _db = db;

    // ─────────────────────────────────────────────────────────────────────────
    //  LISTA BLANCA — única fuente de verdad
    //  Para habilitar un catálogo nuevo se agrega una línea aquí y aparece
    //  solo en la interfaz: no hay que escribir endpoints ni pantallas.
    // ─────────────────────────────────────────────────────────────────────────
    public static readonly IReadOnlyDictionary<string, CatalogoDef> Catalogos =
        new Dictionary<string, CatalogoDef>(StringComparer.OrdinalIgnoreCase)
        {
            ["servicios"] = new CatalogoDef
            {
                Clave = "servicios", Titulo = "Servicios", Icono = "bi-shield-check",
                Tabla = "CRM.Servicio", ColumnaId = "IdServicio",
                ColumnaNombre = "Nombre", EtiquetaNombre = "Nombre del servicio",
                LargoNombre = 100
            },
            ["modalidades"] = new CatalogoDef
            {
                Clave = "modalidades", Titulo = "Modalidades de contrato", Icono = "bi-layers",
                Tabla = "CRM.ModalidadContrato", ColumnaId = "IdModalidad",
                ColumnaNombre = "Descripcion", EtiquetaNombre = "Modalidad",
                LargoNombre = 20
            },
            ["sectores"] = new CatalogoDef
            {
                Clave = "sectores", Titulo = "Sectores económicos", Icono = "bi-briefcase",
                Tabla = "CRM.SectorEconomico", ColumnaId = "IdSectorEconomico",
                ColumnaNombre = "Descripcion", EtiquetaNombre = "Sector económico",
                LargoNombre = 100
            },
            ["tipos-cliente"] = new CatalogoDef
            {
                Clave = "tipos-cliente", Titulo = "Tipos de cliente", Icono = "bi-people",
                Tabla = "CRM.TipoCliente", ColumnaId = "IdTipoCliente",
                ColumnaNombre = "Descripcion", EtiquetaNombre = "Tipo de cliente",
                LargoNombre = 20
            },
            ["regiones"] = new CatalogoDef
            {
                Clave = "regiones", Titulo = "Regiones", Icono = "bi-map",
                Tabla = "CRM.Region", ColumnaId = "IdRegion",
                ColumnaNombre = "Nombre", EtiquetaNombre = "Región",
                LargoNombre = 50
            },
            ["departamentos"] = new CatalogoDef
            {
                Clave = "departamentos", Titulo = "Departamentos", Icono = "bi-geo",
                Tabla = "CRM.Departamento", ColumnaId = "IdDepartamento",
                ColumnaNombre = "Nombre", EtiquetaNombre = "Departamento",
                LargoNombre = 100,
                ColumnaCodigo = "CodigoDANE", LargoCodigo = 2,
                ColumnaPadre = "IdRegion", CatalogoPadre = "regiones", EtiquetaPadre = "Región"
            },
            ["municipios"] = new CatalogoDef
            {
                Clave = "municipios", Titulo = "Municipios", Icono = "bi-geo-alt",
                Tabla = "CRM.Municipio", ColumnaId = "IdMunicipio",
                ColumnaNombre = "Nombre", EtiquetaNombre = "Municipio",
                LargoNombre = 150,
                ColumnaCodigo = "CodigoDANE", LargoCodigo = 5,
                ColumnaPadre = "IdDepartamento", CatalogoPadre = "departamentos", EtiquetaPadre = "Departamento"
            }
        };

    public static CatalogoDef? Resolver(string? clave) =>
        clave is not null && Catalogos.TryGetValue(clave, out var def) ? def : null;

    // ─────────────────────────────────────────────────────────────────────────
    //  METADATOS
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<IEnumerable<CatalogoMetaDto>> GetMetadatosAsync()
    {
        using var conn = _db.CreateConnection();
        var lista = new List<CatalogoMetaDto>();

        foreach (var d in Catalogos.Values)
        {
            var total = await conn.ExecuteScalarAsync<int>($"SELECT COUNT(*) FROM {d.Tabla}");
            lista.Add(new CatalogoMetaDto
            {
                Clave = d.Clave, Titulo = d.Titulo, Icono = d.Icono,
                EtiquetaNombre = d.EtiquetaNombre, LargoNombre = d.LargoNombre,
                TieneActivo = d.TieneActivo,
                TieneCodigo = d.ColumnaCodigo is not null, LargoCodigo = d.LargoCodigo,
                CatalogoPadre = d.CatalogoPadre, EtiquetaPadre = d.EtiquetaPadre,
                Total = total
            });
        }
        return lista;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  LECTURA
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<IEnumerable<CatalogoFilaDto>> ListarAsync(CatalogoDef d, string? filtro)
    {
        using var conn = _db.CreateConnection();

        var codigo = d.ColumnaCodigo is null ? "NULL" : $"t.{d.ColumnaCodigo}";
        var activo = d.TieneActivo ? "t.Activo" : "CAST(1 AS BIT)";

        var padreSelect = "NULL AS IdPadre, NULL AS Padre";
        var padreJoin   = "";

        if (d.ColumnaPadre is not null && Resolver(d.CatalogoPadre) is CatalogoDef p)
        {
            padreSelect = $"t.{d.ColumnaPadre} AS IdPadre, p.{p.ColumnaNombre} AS Padre";
            padreJoin   = $"LEFT JOIN {p.Tabla} p ON p.{p.ColumnaId} = t.{d.ColumnaPadre}";
        }

        // El filtro va parametrizado: la interpolación solo arma nombres de
        // objeto que provienen de la lista blanca.
        var sql = $@"
            SELECT t.{d.ColumnaId}     AS Id,
                   t.{d.ColumnaNombre} AS Nombre,
                   {codigo}            AS Codigo,
                   {padreSelect},
                   {activo}            AS Activo,
                   ISNULL(u.Usos, 0)   AS Usos
            FROM       {d.Tabla} t
            {padreJoin}
            LEFT JOIN CRM.VW_CatalogoEnUso u
                   ON u.Catalogo = @Clave AND u.IdElemento = t.{d.ColumnaId}
            WHERE  (@Filtro IS NULL OR t.{d.ColumnaNombre} LIKE '%' + @Filtro + '%')
            ORDER  BY t.{d.ColumnaNombre}";

        return await conn.QueryAsync<CatalogoFilaDto>(sql,
            new { Clave = d.Clave, Filtro = string.IsNullOrWhiteSpace(filtro) ? null : filtro.Trim() });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  ALTA
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<int> CrearAsync(CatalogoDef d, CatalogoGuardarRequest req)
    {
        using var conn = _db.CreateConnection();

        var cols = new List<string> { d.ColumnaNombre };
        var vals = new List<string> { "@Nombre" };

        if (d.ColumnaCodigo is not null) { cols.Add(d.ColumnaCodigo); vals.Add("@Codigo"); }
        if (d.ColumnaPadre  is not null) { cols.Add(d.ColumnaPadre);  vals.Add("@IdPadre"); }
        if (d.TieneActivo)               { cols.Add("Activo");        vals.Add("@Activo"); }

        var sql = $@"
            INSERT INTO {d.Tabla} ({string.Join(", ", cols)})
            VALUES ({string.Join(", ", vals)});
            SELECT CAST(SCOPE_IDENTITY() AS INT);";

        return await conn.ExecuteScalarAsync<int>(sql, new
        {
            Nombre  = Normalizar(req.Nombre),
            Codigo  = req.Codigo?.Trim(),
            IdPadre = req.IdPadre,
            Activo  = req.Activo
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EDICIÓN
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<int> ActualizarAsync(CatalogoDef d, int id, CatalogoGuardarRequest req)
    {
        using var conn = _db.CreateConnection();

        var sets = new List<string> { $"{d.ColumnaNombre} = @Nombre" };
        if (d.ColumnaCodigo is not null) sets.Add($"{d.ColumnaCodigo} = @Codigo");
        if (d.ColumnaPadre  is not null) sets.Add($"{d.ColumnaPadre} = @IdPadre");
        if (d.TieneActivo)               sets.Add("Activo = @Activo");

        var sql = $@"
            UPDATE {d.Tabla}
            SET    {string.Join(", ", sets)}
            WHERE  {d.ColumnaId} = @Id";

        return await conn.ExecuteAsync(sql, new
        {
            Id      = id,
            Nombre  = Normalizar(req.Nombre),
            Codigo  = req.Codigo?.Trim(),
            IdPadre = req.IdPadre,
            Activo  = req.Activo
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  BAJA
    //  Si el elemento está en uso NO se borra: se desactiva. Un DELETE
    //  rompería la integridad del histórico de oportunidades que lo
    //  referencian, y ese histórico es la base de todos los indicadores.
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<string> EliminarAsync(CatalogoDef d, int id)
    {
        using var conn = _db.CreateConnection();

        var usos = await conn.ExecuteScalarAsync<int>(
            "SELECT ISNULL(SUM(Usos), 0) FROM CRM.VW_CatalogoEnUso WHERE Catalogo = @Clave AND IdElemento = @Id",
            new { Clave = d.Clave, Id = id });

        if (usos > 0)
        {
            if (!d.TieneActivo)
                throw new InvalidOperationException(
                    $"No se puede eliminar: {usos} registro(s) dependen de este elemento.");

            await conn.ExecuteAsync(
                $"UPDATE {d.Tabla} SET Activo = 0 WHERE {d.ColumnaId} = @Id", new { Id = id });

            return $"El elemento quedó desactivado porque {usos} registro(s) lo usan. " +
                   "No se elimina para no romper el histórico.";
        }

        await conn.ExecuteAsync($"DELETE FROM {d.Tabla} WHERE {d.ColumnaId} = @Id", new { Id = id });
        return "Elemento eliminado.";
    }

    // Todos los catálogos se guardan en mayúsculas, como el resto del sistema.
    private static string Normalizar(string valor) => (valor ?? "").Trim().ToUpperInvariant();
}
