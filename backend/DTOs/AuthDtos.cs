using System.ComponentModel.DataAnnotations;

namespace CRM.Api.DTOs;

// ─────────────────────────────────────────────────────────────────────────────
//  AUTH
// ─────────────────────────────────────────────────────────────────────────────

public class LoginRequest
{
    [Required] public string Usuario      { get; set; } = string.Empty;
    [Required] public string PasswordHash { get; set; } = string.Empty; // SHA-256 hex en mayúsculas
}

public class LoginResponse
{
    public bool   Ok     { get; set; }
    public string Msg    { get; set; } = string.Empty;
    public string Nombre { get; set; } = string.Empty;
    public string Rol    { get; set; } = string.Empty;
    public int    IdConsultor { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONSULTOR — CRUD Admin
// ─────────────────────────────────────────────────────────────────────────────

public class ConsultorDto
{
    public int     IdConsultor    { get; set; }
    public string  NombreCompleto { get; set; } = string.Empty;
    public string? Email          { get; set; }
    public string? Usuario        { get; set; }
    public bool    Activo         { get; set; }
    public int?    IdRol          { get; set; }
    public string? NombreRol      { get; set; }
    // Contrasena nunca se expone al cliente
}

public class CrearConsultorRequest
{
    [Required, MaxLength(100)]
    public string NombreCompleto { get; set; } = string.Empty;

    [MaxLength(150)]
    public string? Email { get; set; }

    [Required, MaxLength(50)]
    public string Usuario { get; set; } = string.Empty;

    /// <summary>SHA-256 hex en mayúsculas de la contraseña inicial</summary>
    [Required, MaxLength(100)]
    public string PasswordHash { get; set; } = string.Empty;

    public int? IdRol { get; set; }
}

public class ActualizarConsultorRequest
{
    [Required, MaxLength(100)]
    public string NombreCompleto { get; set; } = string.Empty;

    [MaxLength(150)]
    public string? Email { get; set; }

    [Required, MaxLength(50)]
    public string Usuario { get; set; } = string.Empty;

    public int?  IdRol  { get; set; }
    public bool  Activo { get; set; }
}

public class CambiarPasswordRequest
{
    /// <summary>SHA-256 hex en mayúsculas de la nueva contraseña</summary>
    [Required, MaxLength(100)]
    public string NuevoPasswordHash { get; set; } = string.Empty;
}

public class RolDto
{
    public int    IdRol     { get; set; }
    public string NombreRol { get; set; } = string.Empty;
}
