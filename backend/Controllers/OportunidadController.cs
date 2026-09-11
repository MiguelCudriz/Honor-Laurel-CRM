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

    /// <summary>
    /// [v10] Pipeline actual paginado. Devuelve { items, total, pagina,
    /// tamano, totalPaginas }: la grilla ya no descarga la tabla completa.
    /// </summary>
    [HttpGet("oportunidades")]
    public async Task<IActionResult> GetOportunidades(
        [FromQuery] string? consultor,
        [FromQuery] string? fase,
        [FromQuery] string? tipoCierre,
        [FromQuery] string? buscar,
        [FromQuery] string? estado,
        [FromQuery] int     pagina = 1,
        [FromQuery] int     tamano = 25)
    {
        var data = await _svc.GetOportunidadesActualesAsync(
            consultor, fase, tipoCierre, buscar, estado, pagina, tamano);
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
        catch (SqlException ex)
        {
            return MapearErrorSql(ex, "al crear oportunidad");
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
        catch (SqlException ex)
        {
            return MapearErrorSql(ex, "al actualizar fase");
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
        catch (SqlException ex)
        {
            return MapearErrorSql(ex, "al actualizar oportunidad");
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
        catch (SqlException ex)
        {
            return MapearErrorSql(ex, "al asignar número de cotización");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  [v8] CORRECCIÓN DE CIERRES MAL REGISTRADOS
    //
    //  Reservado a ADMIN y SUPERVISOR. El rol viaja en la cabecera X-Rol, la
    //  misma vía por la que ya se envía el usuario: no hay tokens en esta
    //  aplicación, así que se valida igual que el resto de los endpoints.
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// [v8] Usuario que ejecuta la acción. La aplicación no usa tokens, así que
    /// el frontend lo envía en la cabecera X-Usuario; si no llega, se cae a la
    /// identidad del request. Importa porque queda escrito en la auditoría.
    /// </summary>
    private string UsuarioActual
    {
        get
        {
            var h = Request.Headers["X-Usuario"].FirstOrDefault()?.Trim();
            return string.IsNullOrWhiteSpace(h) ? (User.Identity?.Name ?? "SISTEMA") : h;
        }
    }

    private bool PuedeCorregirCierres() =>
        (Request.Headers["X-Rol"].FirstOrDefault() ?? "")
            .Trim().ToUpperInvariant() is "ADMIN" or "SUPERVISOR";

    /// <summary>Revierte el último movimiento: la oportunidad vuelve a su fase anterior.</summary>
    [HttpPost("oportunidades/revertir-movimiento")]
    public async Task<IActionResult> RevertirMovimiento([FromBody] AnularMovimientoRequest req)
    {
        if (!PuedeCorregirCierres())
            return StatusCode(StatusCodes.Status403Forbidden,
                ApiResponse<object>.Fail("Solo un ADMIN o SUPERVISOR puede corregir un cierre."));

        if (req.IdOportunidad <= 0)
            return BadRequest(ApiResponse<object>.Fail("Oportunidad no válida."));

        if (string.IsNullOrWhiteSpace(req.Motivo) || req.Motivo.Trim().Length < 10)
            return BadRequest(ApiResponse<object>.Fail("Describe el motivo de la corrección (mínimo 10 caracteres)."));

        try
        {
            var data = await _svc.AnularUltimoMovimientoAsync(req, UsuarioActual);
            _logger.LogWarning("Movimiento revertido en oportunidad {Id} por {Usuario}. Motivo: {Motivo}",
                req.IdOportunidad, UsuarioActual, req.Motivo);
            return Ok(ApiResponse<AnularMovimientoResponse>.Ok(data, data.Mensaje));
        }
        catch (SqlException ex)
        {
            return MapearErrorSql(ex, "al revertir el movimiento");
        }
    }

    /// <summary>Da de baja la oportunidad completa. No borra: la saca de circulación.</summary>
    [HttpPost("oportunidades/anular")]
    public async Task<IActionResult> AnularOportunidad([FromBody] AnularMovimientoRequest req)
    {
        if (!PuedeCorregirCierres())
            return StatusCode(StatusCodes.Status403Forbidden,
                ApiResponse<object>.Fail("Solo un ADMIN o SUPERVISOR puede anular una oportunidad."));

        if (req.IdOportunidad <= 0)
            return BadRequest(ApiResponse<object>.Fail("Oportunidad no válida."));

        if (string.IsNullOrWhiteSpace(req.Motivo) || req.Motivo.Trim().Length < 10)
            return BadRequest(ApiResponse<object>.Fail("Describe el motivo de la anulación (mínimo 10 caracteres)."));

        try
        {
            var data = await _svc.AnularOportunidadAsync(req, UsuarioActual);
            _logger.LogWarning("Oportunidad {Id} anulada por {Usuario}. Motivo: {Motivo}",
                req.IdOportunidad, UsuarioActual, req.Motivo);
            return Ok(ApiResponse<AnularMovimientoResponse>.Ok(data, data.Mensaje));
        }
        catch (SqlException ex)
        {
            return MapearErrorSql(ex, "al anular la oportunidad");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  [v5] MAPEO CENTRALIZADO DE ERRORES SQL
    //
    //  Una sola tabla en vez de repetir cadenas de catch en cada endpoint.
    //  Para agregar un código nuevo basta con añadir una línea aquí.
    //  Mensaje vacío ("") = usar el texto que envía el SP, porque ya viene
    //  redactado para el usuario y es dinámico (ej. 50016 incluye el nombre
    //  de la modalidad y su tope de meses).
    // ─────────────────────────────────────────────────────────────────────────
    private static readonly IReadOnlyDictionary<int, (int Status, string Mensaje)> ErroresSql =
        new Dictionary<int, (int, string)>
        {
            [50001] = (StatusCodes.Status404NotFound, "Oportunidad no encontrada o inactiva."),
            [50002] = (StatusCodes.Status400BadRequest, "La fecha indicada no existe en el calendario del sistema (DimFecha)."),
            [50003] = (StatusCodes.Status409Conflict, "Ya existe un movimiento idéntico (misma fase, fecha y valores) para esta oportunidad."),
            [50011] = (StatusCodes.Status409Conflict, "El N° de cotización ya existe en otra oportunidad."),
            [50012] = (StatusCodes.Status400BadRequest, "El Valor Mensual no puede ser negativo."),
            [50013] = (StatusCodes.Status400BadRequest, "El Costo no puede ser negativo."),
            [50014] = (StatusCodes.Status400BadRequest, "El Costo no puede ser igual o superar el Valor Mensual."),
            [50015] = (StatusCodes.Status400BadRequest, "El Tiempo (meses) debe ser mayor a 0."),
            [50016] = (StatusCodes.Status400BadRequest, ""),   // tope de meses por modalidad (mensaje del SP)
            [50017] = (StatusCodes.Status400BadRequest, ""),   // faltan datos comerciales para la fase
            [50018] = (StatusCodes.Status400BadRequest, ""),   // la fase exige Valor Mensual > 0
            [50019] = (StatusCodes.Status400BadRequest, "No se puede registrar un Costo si el Valor Mensual es 0."),
            [50020] = (StatusCodes.Status400BadRequest, "Debe informar el Id de la oportunidad o su N° de cotización."),
            [50021] = (StatusCodes.Status400BadRequest, "Esta fase exige el N° de cotización."),
            [50022] = (StatusCodes.Status400BadRequest, "Para registrar un cliente nuevo se requiere el Sector Económico."),
            [50030] = (StatusCodes.Status409Conflict, "El NIT ingresado ya pertenece a otro cliente registrado."),
            [50050] = (StatusCodes.Status409Conflict, "No se puede retroceder de fase. Solo se permite avanzar o corregir la fase vigente."),
            [50060] = (StatusCodes.Status409Conflict, "La oportunidad no tiene movimientos vigentes que revertir."),
            [50061] = (StatusCodes.Status409Conflict, ""),   // único movimiento (mensaje del SP)
            [50062] = (StatusCodes.Status400BadRequest, "Debe indicar el motivo de la corrección (mínimo 10 caracteres)."),
            [50063] = (StatusCodes.Status409Conflict, "La oportunidad ya está inactiva."),
            [2627]  = (StatusCodes.Status409Conflict, "El N° de cotización ya existe en otra oportunidad."),
            [2601]  = (StatusCodes.Status409Conflict, "El N° de cotización ya existe en otra oportunidad."),
        };

    private IActionResult MapearErrorSql(SqlException ex, string contexto)
    {
        if (ErroresSql.TryGetValue(ex.Number, out var e))
        {
            var mensaje = string.IsNullOrWhiteSpace(e.Mensaje) ? ex.Message : e.Mensaje;
            _logger.LogWarning("Regla de negocio {Num} {Contexto}: {Msg}", ex.Number, contexto, mensaje);
            return StatusCode(e.Status, ApiResponse<object>.Fail(mensaje));
        }

        _logger.LogError(ex, "Error SQL {Contexto}", contexto);
        return StatusCode(StatusCodes.Status500InternalServerError,
            ApiResponse<object>.Fail($"Error de base de datos: {ex.Message}"));
    }
}
