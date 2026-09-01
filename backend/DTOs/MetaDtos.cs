using System.ComponentModel.DataAnnotations;

namespace CRM.Api.DTOs;

// ─────────────────────────────────────────────────────────────────────────────
//  REQUEST: Guardar Meta Anual
// ─────────────────────────────────────────────────────────────────────────────
public class GuardarMetaAnualRequest
{
    [Required, Range(2020, 2050)]
    public int Anio { get; set; }

    [Required, Range(1, double.MaxValue)]
    public decimal MetaTotalAnual { get; set; }

    [MaxLength(200)]
    public string? Descripcion { get; set; }

    /// <summary>12 porcentajes mensuales en orden ENE..DIC.
    /// Deben sumar exactamente 1.0 (100%).</summary>
    [Required]
    public List<decimal> PorcentajesMensuales { get; set; } = new();
}

// ─────────────────────────────────────────────────────────────────────────────
//  REQUEST: Guardar Metas Consultores
// ─────────────────────────────────────────────────────────────────────────────
public class GuardarMetasConsultoresRequest
{
    [Required, Range(2020, 2050)]
    public int Anio { get; set; }

    /// <summary>Lista de consultores con su % asignado. Deben sumar 100%.</summary>
    [Required]
    public List<MetaConsultorItem> Consultores { get; set; } = new();
}

public class MetaConsultorItem
{
    [Required]
    public int IdConsultor { get; set; }

    /// <summary>Porcentaje del consultor (0.0001 a 1.0000). Ej: 0.2750 = 27.5%</summary>
    [Required, Range(0.0001, 1.0)]
    public decimal Pct { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  RESPONSES
// ─────────────────────────────────────────────────────────────────────────────
public class MetaAnualDto
{
    public int     IdMetaAnual     { get; set; }
    public int     Anio            { get; set; }
    public decimal MetaTotalAnual  { get; set; }
    public string? Descripcion     { get; set; }
    public bool    Activo          { get; set; }

    /// <summary>Distribución mensual (12 ítems ENE..DIC).</summary>
    public List<DistribucionMensualDto> DistribucionMensual { get; set; } = new();

    /// <summary>Distribución por consultor (puede estar vacía si aún no se configuró).</summary>
    public List<MetaConsultorDto> MetasConsultores { get; set; } = new();
}

public class DistribucionMensualDto
{
    public int     IdMes         { get; set; }
    public string  NombreMes     { get; set; } = string.Empty;
    public decimal PorcentajeMes { get; set; }
    /// <summary>Valor absoluto: MetaTotal * PorcentajeMes</summary>
    public decimal MetaMensual   { get; set; }
    /// <summary>Meta mínima mensual según avance del año (la "escalera").</summary>
    public decimal MetaEscalera  { get; set; }
    public int     MesesRestantes{ get; set; }
}

public class MetaConsultorDto
{
    public int     IdConsultor          { get; set; }
    public string  NombreConsultor      { get; set; } = string.Empty;
    public decimal PorcentajeConsultor  { get; set; }
    /// <summary>MetaTotal * PorcentajeConsultor</summary>
    public decimal MetaAnualConsultor   { get; set; }
    /// <summary>Distribución mensual del consultor.</summary>
    public List<MetaMensualConsultorDto> MetasMensuales { get; set; } = new();
}

public class MetaMensualConsultorDto
{
    public int     IdMes        { get; set; }
    public string  NombreMes    { get; set; } = string.Empty;
    public decimal MetaMensual  { get; set; }
    public decimal MetaEscalera { get; set; }
}

/// <summary>Resumen compacto para el dashboard de indicadores.</summary>
public class ResumenMetaDto
{
    public int     Anio           { get; set; }
    public decimal MetaTotalAnual { get; set; }
    public int     MesActual      { get; set; }
    public string  NombreMesActual{ get; set; } = string.Empty;
    public decimal MetaMesActual  { get; set; }  // empresa
    public decimal MetaEscalera   { get; set; }  // empresa
    public List<ResumenMetaConsultorDto> PorConsultor { get; set; } = new();
}

public class ResumenMetaConsultorDto
{
    public int     IdConsultor    { get; set; }
    public string  NombreConsultor{ get; set; } = string.Empty;
    public decimal MetaMes        { get; set; }
    public decimal MetaEscalera   { get; set; }
    public decimal MetaAnual      { get; set; }
}
