using Microsoft.AspNetCore.Mvc;
using CRM.Api.DTOs;
using CRM.Api.Services;

namespace CRM.Api.Controllers;

/// <summary>
/// Gestión de consultores — solo para el panel de Administrador.
///
///   GET    /api/admin/roles                      → Catálogo de roles
///   GET    /api/admin/consultores                → Lista completa (incl. inactivos)
///   GET    /api/admin/consultores/{id}           → Detalle de uno
///   POST   /api/admin/consultores                → Crear nuevo
///   PUT    /api/admin/consultores/{id}           → Actualizar datos
///   PATCH  /api/admin/consultores/{id}/password  → Cambiar contraseña
///   PATCH  /api/admin/consultores/{id}/toggle    → Activar / desactivar
/// </summary>
[ApiController]
[Route("api/admin")]
[Produces("application/json")]
public class ConsultorController : ControllerBase
{
    private readonly ConsultorService _svc;
    private readonly ILogger<ConsultorController> _logger;

    public ConsultorController(ConsultorService svc, ILogger<ConsultorController> logger)
    {
        _svc    = svc;
        _logger = logger;
    }

    [HttpGet("roles")]
    public async Task<IActionResult> GetRoles()
        => Ok(ApiResponse<object>.Ok(await _svc.GetRolesAsync()));

    [HttpGet("consultores")]
    public async Task<IActionResult> GetTodos()
        => Ok(ApiResponse<object>.Ok(await _svc.GetTodosAsync()));

    [HttpGet("consultores/{id:int}")]
    public async Task<IActionResult> GetUno(int id)
    {
        var c = await _svc.GetByIdAsync(id);
        return c is null
            ? NotFound(ApiResponse<object>.Fail($"Consultor {id} no encontrado."))
            : Ok(ApiResponse<object>.Ok(c));
    }

    [HttpPost("consultores")]
    public async Task<IActionResult> Crear([FromBody] CrearConsultorRequest req)
    {
        if (!ModelState.IsValid)
            return BadRequest(ApiResponse<object>.Fail(
                string.Join(" | ", ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage))));
        try
        {
            var id = await _svc.CrearAsync(req);
            _logger.LogInformation("Consultor creado: {N} (id={Id})", req.NombreCompleto, id);
            return CreatedAtAction(nameof(GetUno), new { id },
                ApiResponse<object>.Ok(new { id }, "Consultor creado exitosamente."));
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(ApiResponse<object>.Fail(ex.Message));
        }
    }

    [HttpPut("consultores/{id:int}")]
    public async Task<IActionResult> Actualizar(int id, [FromBody] ActualizarConsultorRequest req)
    {
        if (!ModelState.IsValid)
            return BadRequest(ApiResponse<object>.Fail(
                string.Join(" | ", ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage))));
        try
        {
            await _svc.ActualizarAsync(id, req);
            return Ok(ApiResponse<object>.Ok(new { id }, "Consultor actualizado."));
        }
        catch (KeyNotFoundException ex) { return NotFound(ApiResponse<object>.Fail(ex.Message)); }
        catch (InvalidOperationException ex) { return Conflict(ApiResponse<object>.Fail(ex.Message)); }
    }

    [HttpPatch("consultores/{id:int}/password")]
    public async Task<IActionResult> CambiarPassword(int id, [FromBody] CambiarPasswordRequest req)
    {
        if (!ModelState.IsValid)
            return BadRequest(ApiResponse<object>.Fail("Hash de contraseña requerido."));
        try
        {
            await _svc.CambiarPasswordAsync(id, req);
            return Ok(ApiResponse<object>.Ok(new { }, "Contraseña actualizada."));
        }
        catch (KeyNotFoundException ex) { return NotFound(ApiResponse<object>.Fail(ex.Message)); }
    }

    [HttpPatch("consultores/{id:int}/toggle")]
    public async Task<IActionResult> Toggle(int id, [FromQuery] bool activo)
    {
        try
        {
            await _svc.ToggleActivoAsync(id, activo);
            return Ok(ApiResponse<object>.Ok(new { }, activo ? "Consultor activado." : "Consultor desactivado."));
        }
        catch (KeyNotFoundException ex) { return NotFound(ApiResponse<object>.Fail(ex.Message)); }
    }
}
