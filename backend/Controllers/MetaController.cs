using Microsoft.AspNetCore.Mvc;
using CRM.Api.DTOs;
using CRM.Api.Services;
using Microsoft.Data.SqlClient;

namespace CRM.Api.Controllers;

/// <summary>
/// API de Metas Comerciales — solo accesible para ADMIN.
///
///   GET  /api/metas/anios                     → años con metas configuradas
///   GET  /api/metas/{anio}                    → detalle completo de un año
///   GET  /api/metas/{anio}/resumen            → resumen del mes actual (para dashboard)
///   POST /api/metas/guardar-anual             → crear/actualizar meta anual + distribución mensual
///   POST /api/metas/guardar-consultores       → asignar % por consultor
/// </summary>
[ApiController]
[Route("api/metas")]
[Produces("application/json")]
public class MetaController : ControllerBase
{
    private readonly MetaService _svc;
    private readonly ILogger<MetaController> _logger;

    public MetaController(MetaService svc, ILogger<MetaController> logger)
    {
        _svc    = svc;
        _logger = logger;
    }

    [HttpGet("anios")]
    public async Task<IActionResult> GetAnios()
        => Ok(ApiResponse<object>.Ok(await _svc.GetAniosConMetaAsync()));

    [HttpGet("{anio:int}")]
    public async Task<IActionResult> GetMetaAnual(int anio)
    {
        var data = await _svc.GetMetaAnualAsync(anio);
        if (data is null)
            return NotFound(ApiResponse<object>.Fail($"No existe meta configurada para el año {anio}."));
        return Ok(ApiResponse<object>.Ok(data));
    }

    [HttpGet("{anio:int}/resumen")]
    public async Task<IActionResult> GetResumen(int anio)
    {
        var data = await _svc.GetResumenMetaAsync(anio);
        if (data is null)
            return NotFound(ApiResponse<object>.Fail($"No existe meta configurada para el año {anio}."));
        return Ok(ApiResponse<object>.Ok(data));
    }

    [HttpPost("guardar-anual")]
    public async Task<IActionResult> GuardarMetaAnual([FromBody] GuardarMetaAnualRequest req)
    {
        if (!ModelState.IsValid)
            return BadRequest(ApiResponse<object>.Fail(
                string.Join(" | ", ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage))));

        try
        {
            var usuario = User.Identity?.Name ?? "SISTEMA";
            var id = await _svc.GuardarMetaAnualAsync(req, usuario);
            return Ok(ApiResponse<object>.Ok(new { IdMetaAnual = id }, "Meta anual guardada correctamente."));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ApiResponse<object>.Fail(ex.Message));
        }
        catch (SqlException ex) when (ex.Number == 50040)
        {
            return BadRequest(ApiResponse<object>.Fail("Los porcentajes mensuales deben sumar exactamente 100%."));
        }
        catch (SqlException ex) when (ex.Number == 50041)
        {
            return BadRequest(ApiResponse<object>.Fail("La meta anual debe ser mayor a 0."));
        }
        catch (SqlException ex)
        {
            _logger.LogError(ex, "Error SQL al guardar meta anual");
            return StatusCode(500, ApiResponse<object>.Fail($"Error de base de datos: {ex.Message}"));
        }
    }

    [HttpPost("guardar-consultores")]
    public async Task<IActionResult> GuardarMetasConsultores([FromBody] GuardarMetasConsultoresRequest req)
    {
        if (!ModelState.IsValid)
            return BadRequest(ApiResponse<object>.Fail(
                string.Join(" | ", ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage))));

        try
        {
            var usuario = User.Identity?.Name ?? "SISTEMA";
            await _svc.GuardarMetasConsultoresAsync(req, usuario);
            return Ok(ApiResponse<object>.Ok(null as object, "Metas por consultor guardadas correctamente."));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ApiResponse<object>.Fail(ex.Message));
        }
        catch (SqlException ex) when (ex.Number == 50042)
        {
            return NotFound(ApiResponse<object>.Fail("No existe MetaAnual para ese año. Créela primero."));
        }
        catch (SqlException ex) when (ex.Number == 50044)
        {
            return BadRequest(ApiResponse<object>.Fail("Los porcentajes de consultores deben sumar exactamente 100%."));
        }
        catch (SqlException ex) when (ex.Number == 50045)
        {
            return BadRequest(ApiResponse<object>.Fail("Uno o más consultores no existen o están inactivos."));
        }
        catch (SqlException ex)
        {
            _logger.LogError(ex, "Error SQL al guardar metas consultores");
            return StatusCode(500, ApiResponse<object>.Fail($"Error de base de datos: {ex.Message}"));
        }
    }
}
