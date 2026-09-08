using Microsoft.AspNetCore.Mvc;
using CRM.Api.DTOs;
using CRM.Api.Services;

namespace CRM.Api.Controllers;

/// <summary>
/// Dashboard de Pipeline e Indicadores Comerciales.
///
///   GET /api/pipeline/resumen?anio=2026
///   GET /api/pipeline/por-fase?anio=2026
///   GET /api/pipeline/por-consultor?anio=2026
///   GET /api/pipeline/evolucion-mensual?anio=2026
///   GET /api/pipeline/por-servicio?anio=2026[&filtro=ganada|abierta]
///   GET /api/pipeline/por-modalidad?anio=2026
///   GET /api/pipeline/proximos-a-vencer?dias=60
///   GET /api/pipeline/top-clientes?anio=2026[&top=10][&filtro=ganada|abierta]
///   GET /api/pipeline/por-region?anio=2026[&filtro=ganada|abierta]
///   GET /api/pipeline/forecast?anio=2026[&consultor=NOMBRE]
///   GET /api/pipeline/aiu?anio=2026[&mes=1-12]
/// </summary>
[ApiController]
[Route("api/pipeline")]
[Produces("application/json")]
public class PipelineController : ControllerBase
{
    private readonly PipelineService _svc;
    private readonly ILogger<PipelineController> _logger;

    public PipelineController(PipelineService svc, ILogger<PipelineController> logger)
    {
        _svc    = svc;
        _logger = logger;
    }

    private static int AnioActual => DateTime.Today.Year;

    /// <summary>
    /// [v7] Años disponibles para el selector "Año de corte".
    /// Antes la lista se generaba en el navegador con new Date().getFullYear()
    /// y los 3 años anteriores: dependía del reloj del computador del usuario
    /// y no mostraba un año hasta que llegara, aunque ya hubiera contratos
    /// registrados con inicio en ese año.
    /// </summary>
    [HttpGet("anios")]
    public async Task<IActionResult> GetAnios()
        => Ok(ApiResponse<IEnumerable<int>>.Ok(await _svc.GetAniosDisponiblesAsync()));

    [HttpGet("resumen")]
    public async Task<IActionResult> GetResumen([FromQuery] int? anio)
        => Ok(ApiResponse<PipelineResumenDto>.Ok(
               await _svc.GetResumenAsync(anio ?? AnioActual)));

    [HttpGet("por-fase")]
    public async Task<IActionResult> GetPorFase([FromQuery] int? anio)
        => Ok(ApiResponse<object>.Ok(
               await _svc.GetPorFaseAsync(anio ?? AnioActual)));

    [HttpGet("por-consultor")]
    public async Task<IActionResult> GetPorConsultor([FromQuery] int? anio)
        => Ok(ApiResponse<object>.Ok(
               await _svc.GetPorConsultorAsync(anio ?? AnioActual)));

    [HttpGet("evolucion-mensual")]
    public async Task<IActionResult> GetEvolucionMensual([FromQuery] int? anio)
        => Ok(ApiResponse<object>.Ok(
               await _svc.GetEvolucionMensualAsync(anio ?? AnioActual)));

    /// <summary>
    /// filtro: "ganada" = solo cerradas/ganadas | "abierta" = solo en proceso | null/"todas" = ambas
    /// </summary>
    [HttpGet("por-servicio")]
    public async Task<IActionResult> GetPorServicio(
        [FromQuery] int? anio,
        [FromQuery] string? filtro)
        => Ok(ApiResponse<object>.Ok(
               await _svc.GetPorServicioAsync(anio ?? AnioActual, filtro)));

    [HttpGet("por-modalidad")]
    public async Task<IActionResult> GetPorModalidad([FromQuery] int? anio)
        => Ok(ApiResponse<object>.Ok(
               await _svc.GetPorModalidadAsync(anio ?? AnioActual)));

    [HttpGet("proximos-a-vencer")]
    public async Task<IActionResult> GetProximosAVencer([FromQuery] int? dias)
        => Ok(ApiResponse<object>.Ok(
               await _svc.GetProximosAVencerAsync(dias ?? 60)));

    /// <summary>
    /// filtro: "ganada" | "abierta" | null/"todas"
    /// </summary>
    [HttpGet("top-clientes")]
    public async Task<IActionResult> GetTopClientes(
        [FromQuery] int? anio,
        [FromQuery] int? top,
        [FromQuery] string? filtro)
        => Ok(ApiResponse<object>.Ok(
               await _svc.GetTopClientesAsync(anio ?? AnioActual, top ?? 10, filtro)));

    /// <summary>
    /// filtro: "ganada" | "abierta" | null/"todas"
    /// </summary>
    [HttpGet("por-region")]
    public async Task<IActionResult> GetPorRegion(
        [FromQuery] int? anio,
        [FromQuery] string? filtro)
        => Ok(ApiResponse<object>.Ok(
               await _svc.GetPorRegionAsync(anio ?? AnioActual, filtro)));

    /// <summary>
    /// Forecast MRR con corte anual estricto.
    /// Solo incluye oportunidades GANADAS de tipo NUEVO o PROFUNDIZACION.
    /// consultor: nombre del consultor para filtrar (opcional).
    /// </summary>
    [HttpGet("forecast")]
    public async Task<IActionResult> GetForecast(
        [FromQuery] int? anio,
        [FromQuery] string? consultor)
    {
        int y = anio ?? AnioActual;
        _logger.LogInformation("Forecast {Y} consultor={C}", y, consultor ?? "todos");
        return Ok(ApiResponse<ForecastDto>.Ok(await _svc.GetForecastAsync(y, consultor)));
    }
    /// <summary>
    /// Análisis de Rentabilidad mensual (AIU).
    /// Solo GANADAS + TipoCliente NUEVO/PROFUNDIZACION.
    /// Agrupado por mes de INICIO del servicio (no por fecha de registro).
    /// % AIU = ((SUM(Tarifa) - SUM(Costo)) / SUM(Cotización)) * 100
    /// mes: 1-12 filtra los totales por mes puntual (la tabla mensual siempre muestra los 12).
    /// </summary>
    [HttpGet("aiu")]
    public async Task<IActionResult> GetAiu(
        [FromQuery] int? anio,
        [FromQuery] int? mes)
        => Ok(ApiResponse<AiuResumenDto>.Ok(
               await _svc.GetAiuAsync(anio ?? AnioActual, mes)));

    /// <summary>
    /// EFECTIVIDAD DE OFERTAS — % Ventas sobre oportunidades con Prob >= 40%, por mes.
    /// </summary>
    [HttpGet("efectividad-ofertas")]
    public async Task<IActionResult> GetEfectividadOfertas(
        [FromQuery] int?    anio,
        [FromQuery] string? consultor)
    {
        var y = anio ?? AnioActual;
        return Ok(ApiResponse<object>.Ok(
            await _svc.GetEfectividadOfertasAsync(y, consultor)));
    }


}
