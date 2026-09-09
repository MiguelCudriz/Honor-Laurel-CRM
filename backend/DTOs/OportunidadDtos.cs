using System.ComponentModel.DataAnnotations;

namespace CRM.Api.DTOs;

// ─────────────────────────────────────────────────────────────────────────────
//  REQUEST: Crear Oportunidad
// ─────────────────────────────────────────────────────────────────────────────
public class CrearOportunidadRequest
{
    [MaxLength(20)]
    public string? Nit { get; set; }

    [Required, MaxLength(200)]
    public string RazonSocial { get; set; } = string.Empty;

    [Required]
    public int IdTipoCliente { get; set; }

    [Required]
    public int IdSectorEconomico { get; set; }

    [MaxLength(30)]
    public string? NumeroCotizacion { get; set; }

    /// <summary>Teléfono de contacto del prospecto (campo opcional, solo modo NUEVO).</summary>
    [MaxLength(30)]
    public string? Telefono { get; set; }

    /// <summary>Correo electrónico de contacto (campo opcional, solo modo NUEVO).</summary>
    [MaxLength(200)]
    public string? Correo { get; set; }

    [Required]
    public int IdConsultor { get; set; }

    [Required]
    public int IdMunicipio { get; set; }

    [Required]
    public int IdServicio { get; set; }

    /// <summary>
    /// [v3.4] Opcional en fases de Contacto (Email / Telefónico), ya que en esa
    /// etapa aún no se conoce la modalidad comercial. Obligatorio (validado en
    /// frontend) para el resto de fases. Puede completarse después vía
    /// /oportunidades/actualizar-fase.
    /// </summary>
    public int? IdModalidad { get; set; }

    public bool EsLicitacion { get; set; } = false;

    /// <summary>
    /// [v3.4] Opcional en fases de Contacto (Email / Telefónico). Obligatorio
    /// (validado en frontend) para el resto de fases.
    /// </summary>
    [Range(1, 255)]
    public int? TiempoMeses { get; set; }

    [Range(1, 12)]
    public int? IdMesInicio { get; set; }

    public DateTime? FechaInicioServicio { get; set; }
    public DateTime? FechaFinServicio    { get; set; }

    [Required]
    public DateTime Fecha { get; set; }

    [Required]
    public int IdFaseVenta { get; set; }

    [Required, Range(0, double.MaxValue)]
    public decimal ValorMensual { get; set; }

    [Required, Range(0, double.MaxValue)]
    public decimal Costo { get; set; }

    [MaxLength(4000)]
    public string? Observacion { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  REQUEST: Actualizar Oportunidad  [v3.2]
// ─────────────────────────────────────────────────────────────────────────────
public class ActualizarOportunidadRequest
{
    [Required]
    public int IdOportunidad { get; set; }

    [MaxLength(30)]
    public string? NuevoNumeroCotizacion { get; set; }

    public int? IdMunicipio { get; set; }

    [Range(1, 12)]
    public int? IdMesInicio { get; set; }

    [Range(1, 255)]
    public int? TiempoMeses { get; set; }

    public int? IdServicio { get; set; }

    [Required]
    public int IdConsultor { get; set; }

    [Required]
    public DateTime Fecha { get; set; }

    [Required]
    public int IdFaseVenta { get; set; }

    [Required, Range(0, double.MaxValue)]
    public decimal ValorMensual { get; set; }

    [Required, Range(0, double.MaxValue)]
    public decimal Costo { get; set; }

    [MaxLength(4000)]
    public string? Observacion { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  REQUEST: Actualizar Fase — registra movimiento + actualiza datos maestros
//  [v3.3] Añadidos: Nit, IdServicio, IdMunicipio, IdMesInicio,
//         FechaInicioServicio, FechaFinServicio (todos opcionales).
//  [v3.4] Añadido: IdModalidad (opcional) — permite completar/cambiar la
//         modalidad cuando una oportunidad creada en fase de Contacto avanza
//         a una fase que sí la requiere.
// ─────────────────────────────────────────────────────────────────────────────
public class ActualizarFaseRequest
{
    // ── Identificadores (al menos uno obligatorio) ────────────────────────────
    [MaxLength(30)]
    public string? NumeroCotizacion { get; set; }

    public int? IdOportunidad { get; set; }

    // ── Movimiento (siempre obligatorio) ──────────────────────────────────────
    [Required]
    public int IdConsultor { get; set; }

    [Required]
    public DateTime Fecha { get; set; }

    [Required]
    public int IdFaseVenta { get; set; }

    [Required, Range(0, double.MaxValue)]
    public decimal ValorMensual { get; set; }

    [Required, Range(0, double.MaxValue)]
    public decimal Costo { get; set; }

    [MaxLength(4000)]
    public string? Observacion { get; set; }

    // ── Datos maestros opcionales (NULL = sin cambio) ─────────────────────────
    /// <summary>Actualiza CRM.Cliente.NIT si se proporciona.</summary>
    [MaxLength(20)]
    public string? Nit { get; set; }

    /// <summary>Actualiza CRM.Oportunidad.IdServicio si se proporciona.</summary>
    public int? IdServicio { get; set; }

    /// <summary>Actualiza CRM.Oportunidad.IdMunicipio si se proporciona.</summary>
    public int? IdMunicipio { get; set; }

    /// <summary>
    /// [v3.4] Actualiza CRM.Oportunidad.IdModalidad si se proporciona. Permite
    /// completar la modalidad cuando la oportunidad fue creada en fase de
    /// Contacto (sin modalidad) y ahora avanza a una fase que sí la requiere.
    /// </summary>
    public int? IdModalidad { get; set; }

    /// <summary>Actualiza CRM.Oportunidad.IdMesInicio (1–12) si se proporciona.</summary>
    [Range(1, 12)]
    public int? IdMesInicio { get; set; }

    /// <summary>Actualiza CRM.Oportunidad.FechaInicioServicio si se proporciona.</summary>
    public DateTime? FechaInicioServicio { get; set; }

    /// <summary>Actualiza CRM.Oportunidad.FechaFinServicio si se proporciona.</summary>
    public DateTime? FechaFinServicio { get; set; }

    /// <summary>Actualiza CRM.Oportunidad.TiempoMeses si se proporciona.</summary>
    [Range(1, 255)]
    public int? TiempoMeses { get; set; }

    /// <summary>Asigna o corrige el NumeroCotizacion junto con el movimiento.
    /// Cadena vacía = sin cambio. Integrado en el form de actualización para
    /// evitar que el usuario lo omita al registrar un avance.</summary>
    [MaxLength(30)]
    public string? NuevoCotizacion { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  REQUEST: Asignar / Corregir NumeroCotizacion  (restaurado v3.3)
// ─────────────────────────────────────────────────────────────────────────────
public class AsignarCotizacionRequest
{
    [Required]
    public int IdOportunidad { get; set; }

    [MaxLength(30)]
    public string? NuevoNumeroCotizacion { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  RESPONSES
// ─────────────────────────────────────────────────────────────────────────────
public class ApiResponse<T>
{
    public bool    Success { get; set; }
    public string? Message { get; set; }
    public T?      Data    { get; set; }

    public static ApiResponse<T> Ok(T data, string? msg = null) =>
        new() { Success = true, Data = data, Message = msg };

    public static ApiResponse<T> Fail(string msg) =>
        new() { Success = false, Message = msg };
}

public class CrearOportunidadResponse
{
    public int     IdOportunidad    { get; set; }
    public string? NumeroCotizacion { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  READ: Catálogos
// ─────────────────────────────────────────────────────────────────────────────
public class CatalogoItem
{
    public int    Id          { get; set; }
    public string Descripcion { get; set; } = string.Empty;
    public bool   Activo      { get; set; } = true;

    /// <summary>Orden en el funnel — solo se popula para FaseVenta.</summary>
    public int    OrdenFunnel { get; set; } = 0;

    /// <summary>
    /// [v5] Máximo de meses permitido — solo se popula para ModalidadContrato.
    /// NULL = sin límite. La regla vive en la BD (CRM.ModalidadContrato.MaxMeses),
    /// NO en el frontend: cambiarla es un UPDATE de una fila.
    /// </summary>
    public int?   MaxMeses    { get; set; }

    /// <summary>
    /// [v5] Indica si la fase exige datos comerciales completos (modalidad,
    /// tiempo, mes de inicio, fecha de inicio y valor &gt; 0).
    /// Solo se popula para FaseVenta.
    /// </summary>
    public bool   RequiereDatosComerciales { get; set; } = false;

    /// <summary>
    /// [v7] La fase se puede registrar desde cualquier etapa del funnel sin
    /// que cuente como retroceso (cierres y PASO DE MES). Solo para FaseVenta.
    /// </summary>
    public bool   PermiteDesdeCualquierFase { get; set; } = false;
}

public class MesItem
{
    public int    IdMes  { get; set; }
    public string Nombre { get; set; } = string.Empty;
}

public class MunicipioItem
{
    public int    IdMunicipio  { get; set; }
    public string Nombre       { get; set; } = string.Empty;
    public string Departamento { get; set; } = string.Empty;
    public string Region       { get; set; } = string.Empty;
}

public class ClienteItem
{
    public int     IdCliente            { get; set; }
    public string? Nit                  { get; set; }
    public string  RazonSocial          { get; set; } = string.Empty;
    public string  SectorEconomico      { get; set; } = string.Empty;
    public int     OportunidadesActivas { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  READ: Oportunidad vigente (VW_OportunidadesActuales)
// ─────────────────────────────────────────────────────────────────────────────
public class OportunidadVigenteDto
{
    public int      IdOportunidad           { get; set; }
    public string?  NumeroCotizacion        { get; set; }
    public string   ProspectoCliente        { get; set; } = string.Empty;
    public string?  Nit                     { get; set; }

    // ── [v5] Ids crudos: permiten al frontend preseleccionar los <select>
    //         por Id en vez de comparar por texto (frágil ante tildes/mayúsculas).
    public int?     IdTipoCliente           { get; set; }
    public int?     IdConsultorActual       { get; set; }
    public int?     IdSectorEconomico       { get; set; }
    public int?     IdMunicipio             { get; set; }
    public int?     IdServicio              { get; set; }
    public int?     IdModalidad             { get; set; }
    public int?     IdFaseVenta             { get; set; }

    public string?  TipoCliente             { get; set; }
    public bool     EsLicitacion            { get; set; }
    public string   Licitacion              { get; set; } = string.Empty;
    public string   ConsultorActual         { get; set; } = string.Empty;
    public string?  SectorEconomico         { get; set; }
    public string?  Region                  { get; set; }
    public string?  Departamento            { get; set; }
    public string?  Ciudad                  { get; set; }
    public string?  Servicio                { get; set; }

    /// <summary>[v5] NULL cuando la oportunidad aún no tiene modalidad
    /// (creada en fase de Contacto). El frontend muestra "Sin asignar".</summary>
    public string?  ModalidadContrato       { get; set; }

    /// <summary>[v5] Tope de meses de la modalidad (NULL = sin límite).</summary>
    public int?     ModalidadMaxMeses       { get; set; }

    public string   FaseVenta               { get; set; } = string.Empty;
    public int      OrdenFunnel             { get; set; }

    /// <summary>[v5] La fase vigente exige datos comerciales completos.</summary>
    public bool     RequiereDatosComerciales { get; set; }

    /// <summary>[v5] 0 = falta diligenciar modalidad / tiempo / mes / fecha de inicio.</summary>
    public bool     DatosCompletos          { get; set; }

    public decimal  ProbabilidadVenta       { get; set; }
    public bool     EsCierre                { get; set; }
    public string?  TipoCierre              { get; set; }
    public decimal  ValorMensual            { get; set; }
    public decimal  Costo                   { get; set; }
    public decimal  AiuAbsoluto             { get; set; }
    public decimal  PorcentajeAiu           { get; set; }
    public decimal  MontoTotalDuracion      { get; set; }
    public decimal  ValorPonderado          { get; set; }

    /// <summary>
    /// [v5] NULLABLE — obligatorio. Desde el parche de fases, una oportunidad
    /// creada en CONTACTO E-MAIL / TELEFONICO no tiene duración pactada.
    /// Si esta propiedad fuera 'int', Dapper lanzaría
    /// "Error parsing column (TiempoMeses)" y TUMBARÍA LA GRILLA COMPLETA.
    /// </summary>
    public int?     TiempoMeses             { get; set; }

    public int?     IdMesInicio             { get; set; }
    public string?  MesInicio               { get; set; }
    public int?     IdMesFin                { get; set; }
    public string?  MesFin                  { get; set; }
    public DateTime  FechaPrimerRegistro    { get; set; }
    public DateTime  FechaActualizacion     { get; set; }
    public DateTime? FechaInicioServicio    { get; set; }
    public DateTime? FechaFinServicio       { get; set; }
    public string    MesRegistro            { get; set; } = string.Empty;
    public int       AnioRegistro           { get; set; }
    public string    Trimestre              { get; set; } = string.Empty;
    public string    MesAnio                { get; set; } = string.Empty;
    public string?   Observacion            { get; set; }
    public DateTime  FechaUltimoMovimiento  { get; set; }
    public string    UsuarioUltimoMovimiento{ get; set; } = string.Empty;
}
