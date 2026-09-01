using System.ComponentModel.DataAnnotations;

namespace CRM.Api.DTOs;

// ─────────────────────────────────────────────────────────────────────────────
//  RESUMEN — KPIs
// ─────────────────────────────────────────────────────────────────────────────
public class PipelineResumenDto
{
    public int    TotalOportunidades   { get; set; }
    public int    Activas              { get; set; }
    public int    Ganadas              { get; set; }
    public int    Perdidas             { get; set; }
    public decimal ValorPipelineActivo { get; set; }
    public decimal ValorGanado         { get; set; }
    public decimal ValorPonderado      { get; set; }
    public decimal WinRatePorCantidad  { get; set; }
    public decimal WinRatePorValor     { get; set; }
    public int    Anio                 { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  FUNNEL
// ─────────────────────────────────────────────────────────────────────────────
public class PorFaseDto
{
    public string  FaseVenta              { get; set; } = string.Empty;
    public int     OrdenFunnel            { get; set; }
    public decimal PorcentajeProbabilidad { get; set; }
    public bool    EsCierre               { get; set; }
    public string? TipoCierre             { get; set; }
    public int     Cantidad               { get; set; }
    public decimal ValorMensualTotal      { get; set; }
    public decimal MontoTotalDuracion     { get; set; }
    public decimal ValorPonderado         { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  POR CONSULTOR
// ─────────────────────────────────────────────────────────────────────────────
public class PorConsultorDto
{
    public string  Consultor      { get; set; } = string.Empty;
    public int     OpsActivas     { get; set; }
    public int     OpsGanadas     { get; set; }
    public int     OpsPerdidas    { get; set; }
    public decimal ValorPipeline  { get; set; }
    public decimal ValorGanado    { get; set; }
    public decimal WinRate        { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  EVOLUCIÓN MENSUAL
// ─────────────────────────────────────────────────────────────────────────────
public class EvolucionMensualDto
{
    public int     Mes                 { get; set; }
    public string  NombreMes           { get; set; } = string.Empty;
    public int     NuevasOportunidades { get; set; }
    public int     Ganadas             { get; set; }
    public int     Perdidas            { get; set; }
    public decimal ValorNuevo          { get; set; }
    public decimal ValorGanado         { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  POR SERVICIO
// ─────────────────────────────────────────────────────────────────────────────
public class PorServicioDto
{
    public string  Servicio   { get; set; } = string.Empty;
    public int     Cantidad   { get; set; }
    public decimal ValorTotal { get; set; }
    public decimal Porcentaje { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  POR MODALIDAD
// ─────────────────────────────────────────────────────────────────────────────
public class PorModalidadDto
{
    public string  Modalidad  { get; set; } = string.Empty;
    public int     Cantidad   { get; set; }
    public decimal ValorTotal { get; set; }
    public decimal Porcentaje { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  PRÓXIMOS A VENCER
// ─────────────────────────────────────────────────────────────────────────────
public class ProximoAVencerDto
{
    public string?  NumeroCotizacion  { get; set; }
    public string   Cliente           { get; set; } = string.Empty;
    public string   Consultor         { get; set; } = string.Empty;
    public string   FaseVenta         { get; set; } = string.Empty;
    public decimal  ValorMensual      { get; set; }
    public decimal  ProbabilidadVenta { get; set; }
    public string?  MesFin            { get; set; }
    public DateTime? FechaFinServicio { get; set; }
    public int      DiasRestantes     { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  TOP CLIENTES
// ─────────────────────────────────────────────────────────────────────────────
public class TopClienteDto
{
    public string  Cliente       { get; set; } = string.Empty;
    public string? Nit           { get; set; }
    public int     Oportunidades { get; set; }
    public int     Ganadas       { get; set; }
    public decimal ValorPipeline { get; set; }
    public decimal ValorGanado   { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  POR REGIÓN
// ─────────────────────────────────────────────────────────────────────────────
public class PorRegionDto
{
    public string  Region     { get; set; } = string.Empty;
    public int     Cantidad   { get; set; }
    public decimal ValorTotal { get; set; }
    public decimal Porcentaje { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  FORECAST — Modelo de cohortes MRR con corte anual
// ─────────────────────────────────────────────────────────────────────────────
public class ForecastCeldaDto
{
    public int     MesCohorte     { get; set; }
    public int     MesActivo      { get; set; }
    public decimal Valor          { get; set; }
    public decimal ValorFijo      { get; set; }
    public decimal ValorOcasional { get; set; }
}

public class ForecastFilaDto
{
    public int       MesCohorte    { get; set; }
    public string    NombreMes     { get; set; } = string.Empty;
    public decimal[] Valores       { get; set; } = new decimal[12];
    public decimal[] ValoresFijo   { get; set; } = new decimal[12];
    public decimal[] ValoresOcas   { get; set; } = new decimal[12];
    public decimal   TotalFila     { get; set; }
    public int       MesesActivos  { get; set; }
    public int       MesesPerdidos { get; set; }
}

public class ForecastDto
{
    public int   Anio                     { get; set; }
    public List<ForecastFilaDto> Filas    { get; set; } = new();
    public decimal[] TotalesMensuales     { get; set; } = new decimal[12];
    public decimal[] TotalesMensualesFijo { get; set; } = new decimal[12];
    public decimal[] TotalesMensualesOcas { get; set; } = new decimal[12];
    public decimal[] VentaNuevaMes        { get; set; } = new decimal[12];
    public decimal   GranTotal            { get; set; }
    public decimal   GranTotalFijo        { get; set; }
    public decimal   GranTotalOcas        { get; set; }
    public int       CantidadContratos    { get; set; }
    public int       TotalMesesPerdidos   { get; set; }
    public decimal   ValorMesesPerdidos   { get; set; }

    /// <summary>
    /// Lista de consultores con contratos GANADOS (NUEVO/PROFUNDIZACION) en el año.
    /// Se usa para poblar el dropdown de filtro en el frontend.
    /// </summary>
    public List<string> Consultores { get; set; } = new();

    /// <summary>Venta nueva (diagonal) solo contratos FIJO por mes.</summary>
    public decimal[] VentaNuevaMesFijo { get; set; } = new decimal[12];

    /// <summary>Venta nueva (diagonal) solo contratos OCASIONAL por mes.</summary>
    public decimal[] VentaNuevaMesOcas { get; set; } = new decimal[12];
}

// ─────────────────────────────────────────────────────────────────────────────
//  AIU — Análisis de Rentabilidad por mes de INICIO del servicio
//
//  Solo oportunidades: TipoCierre='GANADA' + TipoCliente IN ('NUEVO','PROFUNDIZACION')
//  Agrupado por: MONTH(ISNULL(FechaInicioServicio, FechaPrimerRegistro))
//  Fórmula: % AIU = ((SUM(ValorMensual) - SUM(Costo)) / SUM(MontoTotalDuracion)) * 100
// ─────────────────────────────────────────────────────────────────────────────
public class AiuMensualDto
{
    public int     Mes             { get; set; }
    public string  NombreMes       { get; set; } = string.Empty;
    public int     Cantidad        { get; set; }
    public decimal TotalTarifa     { get; set; }   // SUM(ValorMensual) — tarifa mensual
    public decimal TotalCosto      { get; set; }   // SUM(Costo)
    public decimal TotalCotizacion { get; set; }   // SUM(MontoTotalDuracion) — monto total contrato
    public decimal AiuAbsoluto     { get; set; }   // TotalTarifa - TotalCosto
    public decimal PorcentajeAiu   { get; set; }   // (AiuAbsoluto / TotalCotizacion) * 100
}

public class AiuResumenDto
{
    public int     Anio            { get; set; }
    public int?    MesFiltro       { get; set; }   // null / 0 = anual completo, 1-12 = mes específico
    public int     Cantidad        { get; set; }
    public decimal TotalTarifa     { get; set; }
    public decimal TotalCosto      { get; set; }
    public decimal TotalCotizacion { get; set; }
    public decimal AiuAbsoluto     { get; set; }
    public decimal PorcentajeAiu   { get; set; }
    public List<AiuMensualDto> Mensual { get; set; } = new();
}

// ─────────────────────────────────────────────────────────────────────────────
//  EFECTIVIDAD DE OFERTAS — mes a mes
//  % = Ventas (GANADA) / Total oportunidades con ProbabilidadVenta >= 40%
// ─────────────────────────────────────────────────────────────────────────────
public class EfectividadMesDto
{
    public int     Mes           { get; set; }
    public string  NombreMes     { get; set; } = string.Empty;
    public int     TotalMayor40  { get; set; }   // opors. con Prob >= 40%
    public int     TotalVenta    { get; set; }   // de esas, cuántas son VENTA
    public decimal EfectividadPct{ get; set; }   // TotalVenta/TotalMayor40 *100
}
