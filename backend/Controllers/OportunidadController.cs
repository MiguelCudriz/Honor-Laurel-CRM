using Microsoft.AspNetCore.Mvc;
using CRM.Api.DTOs;
using CRM.Api.Services;
using Microsoft.Data.SqlClient;

namespace CRM.Api.Controllers;

/// <summary>
/// Controlador CRM Oportunidades.
///
///   GET    /api/catalogos/tipos-cliente          → Tipos de cliente
///   GET    /api/catalogos/sectores-economicos    → Sectores económicos
///   GET    /api/catalogos/consultores            → Consultores activos
///   GET    /api/catalogos/servicios              → Portafolio de servicios
///   GET    /api/catalogos/modalidades            → FIJO / OCASIONAL
///   GET    /api/catalogos/fases-venta            → Pipeline de fases
///   GET    /api/catalogos/municipios             → Municipios (con filtro)
///   GET    /api/catalogos/meses                  → Meses del año (CRM.Mes) [v3.2]
///
///   GET    /api/clientes/buscar                  → Autocomplete de clientes
///   GET    /api/clientes/verificar               → Verificar duplicado
///
///   GET    /api/oportunidades                    → Pipeline actual
///   GET    /api/oportunidades/{cotizacion}       → Detalle por cotización
///   GET    /api/oportunidades/id/{id}            → Detalle por IdOportunidad
///   GET    /api/oportunidades/pipeline-consultor → Embudo BI
///   GET    /api/oportunidades/winrate            → Win rate
///
///   POST   /api/oportunidades                    → Crear nueva oportunidad
///   POST   /api/oportunidades/actualizar-fase    → Registrar movimiento de fase
///   POST   /api/oportunidades/actualizar         → Actualizar datos maestros + movimiento [v3.2]
/// </summary>
[ApiController]
[Route("api")]
[Produces("application/json")]
public class OportunidadController : ControllerBase
{
    private readonly OportunidadService _svc;
    private readonly ILogger<OportunidadController> _logger;

    public OportunidadController(OportunidadService svc, ILogger<OportunidadController> logger)
    {
        _svc    = svc;
        _logger = logger;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  CATÁLOGOS
    // ─────────────────────────────────────────────────────────────────────────

    [HttpGet("catalogos/tipos-cliente")]
    public async Task<IActionResult> GetTiposCliente()
        => Ok(ApiResponse<object>.Ok(await _svc.GetTiposClienteAsync()));

    [HttpGet("catalogos/sectores-economicos")]
    public async Task<IActionResult> GetSectores()
        => Ok(ApiResponse<object>.Ok(await _svc.GetSectoresEconomicosAsync()));

    [HttpGet("catalogos/consultores")]
    public async Task<IActionResult> GetConsultores()
        => Ok(ApiResponse<object>.Ok(await _svc.GetConsultoresAsync()));

    [HttpGet("catalogos/servicios")]
    public async Task<IActionResult> GetServicios()
        => Ok(ApiResponse<object>.Ok(await _svc.GetServiciosAsync()));

    [HttpGet("catalogos/modalidades")]
    public async Task<IActionResult> GetModalidades()
        => Ok(ApiResponse<object>.Ok(await _svc.GetModalidadesAsync()));

    [HttpGet("catalogos/fases-venta")]
    public async Task<IActionResult> GetFases()
        => Ok(ApiResponse<object>.Ok(await _svc.GetFasesVentaAsync()));

    [HttpGet("catalogos/municipios")]
    public async Task<IActionResult> GetMunicipios([FromQuery] string? filtro)
        => Ok(ApiResponse<object>.Ok(await _svc.GetMunicipiosAsync(filtro)));

    /// <summary>
    /// [v3.2] Catálogo de los 12 meses del año desde CRM.Mes.
    /// Usado en el formulario para el selector de MesInicio.
    /// MesFin se auto-calcula en BD: no requiere endpoint propio.
    /// </summary>
    [HttpGet("catalogos/meses")]
    public async Task<IActionResult> GetMeses()
        => Ok(ApiResponse<object>.Ok(await _svc.GetMesesAsync()));

    // ─────────────────────────────────────────────────────────────────────────
    //  CLIENTES
    // ─────────────────────────────────────────────────────────────────────────

    [HttpGet("clientes/buscar")]
    public async Task<IActionResult> BuscarClientes([FromQuery] string criterio)
    {
        if (string.IsNullOrWhiteSpace(criterio) || criterio.Length < 2)
            return BadRequest(ApiResponse<object>.Fail("El criterio debe tener al menos 2 caracteres."));

        return Ok(ApiResponse<object>.Ok(await _svc.BuscarClientesAsync(criterio)));
    }

    [HttpGet("clientes/verificar")]
    public async Task<IActionResult> VerificarCliente(
        [FromQuery] string? nit,
        [FromQuery] string razonSocial = "")
    {
        if (string.IsNullOrWhiteSpace(nit) && string.IsNullOrWhiteSpace(razonSocial))
            return BadRequest(ApiResponse<object>.Fail("Se requiere NIT o Razón Social."));

        var cliente = await _svc.BuscarClienteExactoAsync(nit, razonSocial);
        return Ok(ApiResponse<object>.Ok(new { existe = cliente is not null, cliente }));
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  OPORTUNIDADES — LECTURA
    // ─────────────────────────────────────────────────────────────────────────

    [HttpGet("oportunidades")]
    public async Task<IActionResult> GetOportunidades(
        [FromQuery] string? consultor,
        [FromQuery] string? fase,
        [FromQuery] string? tipoCierre)
    {
        var data = await _svc.GetOportunidadesActualesAsync(consultor, fase, tipoCierre);
        return Ok(ApiResponse<object>.Ok(data));
    }

    [HttpGet("oportunidades/pipeline-consultor")]
    public async Task<IActionResult> GetPipeline()
        => Ok(ApiResponse<object>.Ok(await _svc.GetPipelineConsultorAsync()));

    [HttpGet("oportunidades/winrate")]
    public async Task<IActionResult> GetWinRate([FromQuery] int? anio)
        => Ok(ApiResponse<object>.Ok(await _svc.GetWinRateAsync(anio)));

    /// <summary>Detalle por NumeroCotizacion.</summary>
    [HttpGet("oportunidades/{numeroCotizacion}")]
    public async Task<IActionResult> GetDetalle(string numeroCotizacion)
    {
        var data = await _svc.GetDetalleOportunidadAsync(numeroCotizacion);
        if (data is null)
            return NotFound(ApiResponse<object>.Fail($"Cotización '{numeroCotizacion}' no encontrada."));

        return Ok(ApiResponse<object>.Ok(data));
    }

    /// <summary>Detalle por IdOportunidad — para oportunidades sin NumeroCotizacion.</summary>
    [HttpGet("oportunidades/id/{idOportunidad:int}")]
    public async Task<IActionResult> GetDetallePorId(int idOportunidad)
    {
        var data = await _svc.GetDetalleOportunidadPorIdAsync(idOportunidad);
        if (data is null)
            return NotFound(ApiResponse<object>.Fail($"Oportunidad #{idOportunidad} no encontrada."));

        return Ok(ApiResponse<object>.Ok(data));
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  OPORTUNIDADES — ESCRITURA
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Crear nueva oportunidad. NumeroCotizacion es opcional.</summary>
    [HttpPost("oportunidades")]
    public async Task<IActionResult> CrearOportunidad([FromBody] CrearOportunidadRequest req)
    {
        if (!ModelState.IsValid)
            return BadRequest(ApiResponse<object>.Fail(
                string.Join(" | ", ModelState.Values
                    .SelectMany(v => v.Errors)
                    .Select(e => e.ErrorMessage))));

        try
        {
            var usuario  = User.Identity?.Name ?? "SISTEMA";
            var response = await _svc.CrearOportunidadAsync(req, usuario);

            var routeValues = response.NumeroCotizacion is not null
                ? (object)new { numeroCotizacion = response.NumeroCotizacion }
                : (object)new { idOportunidad    = response.IdOportunidad    };

            var actionName = response.NumeroCotizacion is not null
                ? nameof(GetDetalle)
                : nameof(GetDetallePorId);

            return CreatedAtAction(
                actionName,
                routeValues,
                ApiResponse<CrearOportunidadResponse>.Ok(response, "Oportunidad creada exitosamente."));
        }
        catch (SqlException ex) when (ex.Number == 50011)
        {
            return Conflict(ApiResponse<object>.Fail("El NumeroCotizacion ya existe."));
        }
        catch (SqlException ex) when (ex.Number == 50014)
        {
            return BadRequest(ApiResponse<object>.Fail("El Costo no puede ser igual o superar el ValorMensual."));
        }
        catch (SqlException ex) when (ex.Number == 50015)
        {
            return BadRequest(ApiResponse<object>.Fail("TiempoMeses es obligatorio y debe ser mayor a 0."));
        }
        catch (SqlException ex)
        {
            _logger.LogError(ex, "Error SQL al crear oportunidad");
            return StatusCode(500, ApiResponse<object>.Fail($"Error de base de datos: {ex.Message}"));
        }
    }

    /// <summary>
    /// Registrar movimiento de pipeline sobre una oportunidad existente.
    /// Solo actualiza la fase; los datos maestros permanecen sin cambio.
    /// Para actualizar datos maestros Y registrar movimiento usar /actualizar.
    /// </summary>
    [HttpPost("oportunidades/actualizar-fase")]
    public async Task<IActionResult> ActualizarFase([FromBody] ActualizarFaseRequest req)
    {
        if (!ModelState.IsValid)
            return BadRequest(ApiResponse<object>.Fail(
                string.Join(" | ", ModelState.Values
                    .SelectMany(v => v.Errors)
                    .Select(e => e.ErrorMessage))));

        var tieneCot = !string.IsNullOrWhiteSpace(req.NumeroCotizacion);
        var tieneId  = req.IdOportunidad is not null && req.IdOportunidad > 0;

        if (!tieneCot && !tieneId)
            return BadRequest(ApiResponse<object>.Fail(
                "Se requiere NumeroCotizacion o IdOportunidad para identificar la oportunidad."));

        try
        {
            var usuario = User.Identity?.Name ?? "SISTEMA";
            await _svc.ActualizarFaseAsync(req, usuario);

            return Ok(ApiResponse<object>.Ok(
                new
                {
                    NumeroCotizacion = req.NumeroCotizacion?.ToUpper().Trim(),
                    IdOportunidad    = req.IdOportunidad
                },
                "Fase actualizada correctamente."));
        }
        catch (SqlException ex) when (ex.Number == 50001)
        {
            return NotFound(ApiResponse<object>.Fail("Oportunidad no encontrada o inactiva."));
        }
        catch (SqlException ex) when (ex.Number == 50003)
        {
            return Conflict(ApiResponse<object>.Fail("Ya existe un movimiento idéntico (misma fase, fecha y valores) para esta oportunidad."));
        }
        catch (SqlException ex) when (ex.Number == 50011)
        {
            return Conflict(ApiResponse<object>.Fail("El NumeroCotizacion ya existe en otra oportunidad."));
        }
        catch (SqlException ex) when (ex.Number == 50015)
        {
            return BadRequest(ApiResponse<object>.Fail("TiempoMeses debe ser mayor a 0."));
        }
        catch (SqlException ex) when (ex.Number == 50030)
        {
            return Conflict(ApiResponse<object>.Fail("El NIT ingresado ya pertenece a otro cliente registrado."));
        }
        catch (SqlException ex) when (ex.Number == 50050)
        {
            return Conflict(ApiResponse<object>.Fail("No se puede retroceder de fase. Solo se permite avanzar o corregir la misma fase vigente."));
        }
        catch (SqlException ex) when (ex.Number == 50014)
        {
            return BadRequest(ApiResponse<object>.Fail("El Costo no puede ser igual o superar el ValorMensual."));
        }
        catch (SqlException ex) when (ex.Number == 50020)
        {
            return BadRequest(ApiResponse<object>.Fail("Debe informar IdOportunidad o NumeroCotizacion."));
        }
        catch (SqlException ex)
        {
            _logger.LogError(ex, "Error SQL al actualizar fase");
            return StatusCode(500, ApiResponse<object>.Fail($"Error de base de datos: {ex.Message}"));
        }
    }

    /// <summary>
    /// [v3.2] Actualizar datos maestros de una oportunidad Y registrar un movimiento.
    /// Reemplaza al endpoint /asignar-cotizacion (SP eliminado de BD).
    ///
    /// Todos los campos maestros son opcionales (null = sin cambio):
    ///   NuevoNumeroCotizacion → asigna o corrige el número de cotización
    ///   IdMunicipio           → si el servicio cambia de lugar
    ///   IdMesInicio           → si cambia el mes de inicio del contrato
    ///   TiempoMeses           → si cambia la duración pactada (IdMesFin se recalcula en BD)
    ///   IdServicio            → si cambia el tipo de servicio
    ///
    /// El movimiento (consultor, fecha, fase, valores) siempre es obligatorio.
    /// </summary>
    [HttpPost("oportunidades/actualizar")]
    public async Task<IActionResult> ActualizarOportunidad([FromBody] ActualizarOportunidadRequest req)
    {
        if (!ModelState.IsValid)
            return BadRequest(ApiResponse<object>.Fail(
                string.Join(" | ", ModelState.Values
                    .SelectMany(v => v.Errors)
                    .Select(e => e.ErrorMessage))));

        try
        {
            var usuario = User.Identity?.Name ?? "SISTEMA";
            await _svc.ActualizarOportunidadAsync(req, usuario);

            return Ok(ApiResponse<object>.Ok(
                new { req.IdOportunidad },
                "Oportunidad actualizada correctamente."));
        }
        catch (SqlException ex) when (ex.Number == 50001)
        {
            return NotFound(ApiResponse<object>.Fail("Oportunidad no encontrada o inactiva."));
        }
        catch (SqlException ex) when (ex.Number == 50003)
        {
            return Conflict(ApiResponse<object>.Fail("Ya existe un movimiento con la misma fase y fecha."));
        }
        catch (SqlException ex) when (ex.Number == 50011)
        {
            return Conflict(ApiResponse<object>.Fail("El NumeroCotizacion ya existe en otra oportunidad."));
        }
        catch (SqlException ex) when (ex.Number == 50014)
        {
            return BadRequest(ApiResponse<object>.Fail("El Costo no puede ser igual o superar el ValorMensual."));
        }
        catch (SqlException ex) when (ex.Number == 50015)
        {
            return BadRequest(ApiResponse<object>.Fail("TiempoMeses debe ser mayor a 0."));
        }
        catch (SqlException ex)
        {
            _logger.LogError(ex, "Error SQL al actualizar oportunidad");
            return StatusCode(500, ApiResponse<object>.Fail($"Error de base de datos: {ex.Message}"));
        }
    }
    /// <summary>
    /// [v3.3 Restaurado] Asignar o corregir NumeroCotizacion de una oportunidad
    /// sin registrar un nuevo movimiento de pipeline.
    /// Permite usar el panel de edición de cotización en la pantalla
    /// Actualizar/Consultar sin requerir datos de movimiento.
    /// </summary>
    [HttpPost("oportunidades/asignar-cotizacion")]
    public async Task<IActionResult> AsignarCotizacion([FromBody] AsignarCotizacionRequest req)
    {
        if (!ModelState.IsValid)
            return BadRequest(ApiResponse<object>.Fail(
                string.Join(" | ", ModelState.Values
                    .SelectMany(v => v.Errors)
                    .Select(e => e.ErrorMessage))));

        try
        {
            var usuario = User.Identity?.Name ?? "SISTEMA";
            await _svc.AsignarNumeroCotizacionAsync(req, usuario);

            return Ok(ApiResponse<object>.Ok(
                new { req.IdOportunidad, NuevoNumeroCotizacion = req.NuevoNumeroCotizacion?.ToUpper().Trim() },
                "Número de cotización actualizado correctamente."));
        }
        catch (SqlException ex) when (ex.Number == 2627 || ex.Number == 2601)
        {
            // Violación de índice único UX_Oportunidad_NumeroCotizacion
            return Conflict(ApiResponse<object>.Fail("El NumeroCotizacion ya existe en otra oportunidad."));
        }
        catch (SqlException ex)
        {
            _logger.LogError(ex, "Error SQL al asignar número de cotización");
            return StatusCode(500, ApiResponse<object>.Fail($"Error de base de datos: {ex.Message}"));
        }
    }


}
