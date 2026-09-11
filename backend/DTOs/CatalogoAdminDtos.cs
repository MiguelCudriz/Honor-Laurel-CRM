namespace CRM.Api.DTOs;

/// <summary>
/// [v9] MÓDULO DE ADMINISTRACIÓN DE CATÁLOGOS
///
/// Un solo CRUD genérico para las ocho tablas de catálogo, en lugar de ocho
/// controladores, ocho servicios y ocho pantallas que harían lo mismo.
///
/// La clave del diseño está aquí: el cliente NUNCA envía nombres de tabla ni
/// de columna. Envía una clave ("servicios", "municipios") y el backend la
/// resuelve contra esta lista blanca. Cualquier clave desconocida se rechaza
/// antes de tocar la base, así que no hay forma de inyectar SQL por esta vía
/// aunque el endpoint sea genérico.
/// </summary>
public class CatalogoDef
{
    /// <summary>Clave pública del catálogo (la que viaja en la URL).</summary>
    public string Clave { get; init; } = string.Empty;

    /// <summary>Nombre visible en la interfaz.</summary>
    public string Titulo { get; init; } = string.Empty;

    /// <summary>Icono de Bootstrap Icons para la interfaz.</summary>
    public string Icono { get; init; } = "bi-tag";

    /// <summary>Tabla física, ya calificada con el esquema.</summary>
    public string Tabla { get; init; } = string.Empty;

    /// <summary>Columna de llave primaria (IDENTITY).</summary>
    public string ColumnaId { get; init; } = string.Empty;

    /// <summary>Columna con el nombre o descripción del elemento.</summary>
    public string ColumnaNombre { get; init; } = string.Empty;

    /// <summary>Etiqueta de la columna de nombre en la interfaz.</summary>
    public string EtiquetaNombre { get; init; } = "Nombre";

    /// <summary>Longitud máxima de la columna de nombre.</summary>
    public int LargoNombre { get; init; } = 100;

    /// <summary>La tabla tiene columna Activo (permite desactivar en lugar de borrar).</summary>
    public bool TieneActivo { get; init; } = true;

    /// <summary>Columna de código opcional (CodigoDANE). null = no aplica.</summary>
    public string? ColumnaCodigo { get; init; }

    /// <summary>Longitud exacta del código, cuando aplica.</summary>
    public int LargoCodigo { get; init; }

    /// <summary>Columna de llave foránea al catálogo padre. null = no aplica.</summary>
    public string? ColumnaPadre { get; init; }

    /// <summary>Clave del catálogo padre, para poblar el selector.</summary>
    public string? CatalogoPadre { get; init; }

    /// <summary>Etiqueta del padre en la interfaz.</summary>
    public string? EtiquetaPadre { get; init; }
}

/// <summary>Metadatos que la interfaz usa para dibujarse sola.</summary>
public class CatalogoMetaDto
{
    public string  Clave          { get; set; } = string.Empty;
    public string  Titulo         { get; set; } = string.Empty;
    public string  Icono          { get; set; } = string.Empty;
    public string  EtiquetaNombre { get; set; } = string.Empty;
    public int     LargoNombre    { get; set; }
    public bool    TieneActivo    { get; set; }
    public bool    TieneCodigo    { get; set; }
    public int     LargoCodigo    { get; set; }
    public string? CatalogoPadre  { get; set; }
    public string? EtiquetaPadre  { get; set; }
    public int     Total          { get; set; }
}

/// <summary>Una fila de catálogo, ya normalizada para la interfaz.</summary>
public class CatalogoFilaDto
{
    public int     Id       { get; set; }
    public string  Nombre   { get; set; } = string.Empty;
    public string? Codigo   { get; set; }
    public int?    IdPadre  { get; set; }
    public string? Padre    { get; set; }
    public bool    Activo   { get; set; } = true;

    /// <summary>Cuántos registros dependen de este elemento (CRM.VW_CatalogoEnUso).</summary>
    public int     Usos     { get; set; }
}

/// <summary>Alta o edición de un elemento de catálogo.</summary>
public class CatalogoGuardarRequest
{
    public string  Nombre  { get; set; } = string.Empty;
    public string? Codigo  { get; set; }
    public int?    IdPadre { get; set; }
    public bool    Activo  { get; set; } = true;
}
