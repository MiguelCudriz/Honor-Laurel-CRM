using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using CRM.Api.DTOs;
using CRM.Api.Services;

namespace CRM.Api.Controllers;

/// <summary>
/// [v9] ADMINISTRACIÓN DE CATÁLOGOS — solo ADMIN y SUPERVISOR.
///
///   GET    /api/catalogos-admin                  → catálogos disponibles
///   GET    /api/catalogos-admin/{clave}          → elementos del catálogo
///   POST   /api/catalogos-admin/{clave}          → crear
///   PUT    /api/catalogos-admin/{clave}/{id}     → actualizar
///   DELETE /api/catalogos-admin/{clave}/{id}     → eliminar o desactivar
///
/// La clave del catálogo se valida contra la lista blanca de
/// CatalogoAdminService antes de tocar la base. Una clave desconocida se
/// rechaza con 404, así que el endpoint genérico no abre la puerta a
/// consultar tablas arbitrarias.
/// </summary>
[ApiController]
[Route("api/catalogos-admin")]
public class CatalogoAdminController : ControllerBase
{
    private readonly CatalogoAdminService _svc;
    private readonly ILogger<CatalogoAdminController> _logger;

    public CatalogoAdminController(CatalogoAdminService svc, ILogger<CatalogoAdminController> logger)
    {
        _svc = svc;
        _logger = logger;
    }

    // ── Identidad y permisos ────────────────────────────────────────────────
    private string UsuarioActual
    {
        get
        {
            var h = Request.Headers["X-Usuario"].FirstOrDefault()?.Trim();
            return string.IsNullOrWhiteSpace(h) ? (User.Identity?.Name ?? "SISTEMA") : h;
        }
    }

    private bool PuedeAdministrar() =>
        (Request.Headers["X-Rol"].FirstOrDefault() ?? "")
            .Trim().ToUpperInvariant() is "ADMIN" or "SUPERVISOR";

    private IActionResult? Verificar(string clave, out CatalogoDef def)
    {
        def = null!;

        if (!PuedeAdministrar())
            return StatusCode(StatusCodes.Status403Forbidden,
                ApiResponse<object>.Fail("Solo un ADMIN o SUPERVISOR puede administrar los catálogos."));

        var d = CatalogoAdminService.Resolver(clave);
        if (d is null)
            return NotFound(ApiResponse<object>.Fail($"El catálogo '{clave}' no existe o no es administrable."));

        def = d;
        return null;
    }

    // ── Validación de datos ─────────────────────────────────────────────────
    private static string? ValidarRequest(CatalogoDef d, CatalogoGuardarRequest req)
    {
        var nombre = (req.Nombre ?? "").Trim();

        if (nombre.Length < 2)
            return $"{d.EtiquetaNombre} debe tener al menos 2 caracteres.";

        if (nombre.Length > d.LargoNombre)
            return $"{d.EtiquetaNombre} no puede superar {d.LargoNombre} caracteres.";

        if (d.ColumnaCodigo is not null)
        {
            var codigo = (req.Codigo ?? "").Trim();
            if (codigo.Length != d.LargoCodigo || !codigo.All(char.IsDigit))
                return $"El código DANE debe tener exactamente {d.LargoCodigo} dígitos.";
        }

        if (d.ColumnaPadre is not null && (req.IdPadre is null || req.IdPadre <= 0))
            return $"Selecciona {d.EtiquetaPadre}.";

        return null;
    }

    // ── Endpoints ───────────────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> GetCatalogos()
    {
        if (!PuedeAdministrar())
            return StatusCode(StatusCodes.Status403Forbidden,
                ApiResponse<object>.Fail("Solo un ADMIN o SUPERVISOR puede administrar los catálogos."));

        return Ok(ApiResponse<IEnumerable<CatalogoMetaDto>>.Ok(await _svc.GetMetadatosAsync()));
    }

    [HttpGet("{clave}")]
    public async Task<IActionResult> Listar(string clave, [FromQuery] string? filtro)
    {
        if (Verificar(clave, out var def) is IActionResult error) return error;
        return Ok(ApiResponse<IEnumerable<CatalogoFilaDto>>.Ok(await _svc.ListarAsync(def, filtro)));
    }

    [HttpPost("{clave}")]
    public async Task<IActionResult> Crear(string clave, [FromBody] CatalogoGuardarRequest req)
    {
        if (Verificar(clave, out var def) is IActionResult error) return error;

        if (ValidarRequest(def, req) is string msg)
            return BadRequest(ApiResponse<object>.Fail(msg));

        try
        {
            var id = await _svc.CrearAsync(def, req);
            _logger.LogInformation("Catálogo {Clave}: alta id {Id} por {Usuario}", clave, id, UsuarioActual);
            return Ok(ApiResponse<object>.Ok(new { Id = id }, $"{def.EtiquetaNombre} creado."));
        }
        catch (SqlException ex) { return MapearSql(ex, def); }
    }

    [HttpPut("{clave}/{id:int}")]
    public async Task<IActionResult> Actualizar(string clave, int id, [FromBody] CatalogoGuardarRequest req)
    {
        if (Verificar(clave, out var def) is IActionResult error) return error;

        if (ValidarRequest(def, req) is string msg)
            return BadRequest(ApiResponse<object>.Fail(msg));

        try
        {
            var filas = await _svc.ActualizarAsync(def, id, req);
            if (filas == 0)
                return NotFound(ApiResponse<object>.Fail("El elemento ya no existe."));

            _logger.LogInformation("Catálogo {Clave}: edición id {Id} por {Usuario}", clave, id, UsuarioActual);
            return Ok(ApiResponse<object>.Ok(new { Id = id }, "Cambios guardados."));
        }
        catch (SqlException ex) { return MapearSql(ex, def); }
    }

    [HttpDelete("{clave}/{id:int}")]
    public async Task<IActionResult> Eliminar(string clave, int id)
    {
        if (Verificar(clave, out var def) is IActionResult error) return error;

        try
        {
            var mensaje = await _svc.EliminarAsync(def, id);
            _logger.LogWarning("Catálogo {Clave}: baja id {Id} por {Usuario}", clave, id, UsuarioActual);
            return Ok(ApiResponse<object>.Ok(new { Id = id }, mensaje));
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(ApiResponse<object>.Fail(ex.Message));
        }
        catch (SqlException ex) { return MapearSql(ex, def); }
    }

    // ── Errores de base traducidos a lenguaje del usuario ───────────────────
    private IActionResult MapearSql(SqlException ex, CatalogoDef def) => ex.Number switch
    {
        2627 or 2601 => Conflict(ApiResponse<object>.Fail(
                            $"Ya existe un elemento con ese {def.EtiquetaNombre.ToLower()} o código.")),
        547          => Conflict(ApiResponse<object>.Fail(
                            "Hay registros que dependen de este elemento. Desactívalo en lugar de eliminarlo.")),
        _            => Loguear(ex)
    };

    private IActionResult Loguear(SqlException ex)
    {
        _logger.LogError(ex, "Error SQL en administración de catálogos");
        return StatusCode(StatusCodes.Status500InternalServerError,
            ApiResponse<object>.Fail($"Error de base de datos: {ex.Message}"));
    }
}
