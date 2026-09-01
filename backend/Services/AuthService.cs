using Dapper;
using CRM.Api.Data;
using CRM.Api.DTOs;

namespace CRM.Api.Services;

public class AuthService
{
    private readonly CrmDbContext _db;
    private readonly ILogger<AuthService> _logger;

    public AuthService(CrmDbContext db, ILogger<AuthService> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Valida credenciales contra CRM.Consultor.
    /// La contraseña llega como SHA-256 hex en mayúsculas (calculado en el navegador).
    /// Se compara directamente con el campo Contrasena almacenado en la misma codificación.
    /// </summary>
    public async Task<LoginResponse> LoginAsync(LoginRequest req)
    {
        using var conn = _db.CreateConnection();

        // Normalizar usuario a mayúsculas (consistencia)
        var usuarioNorm = req.Usuario.Trim().ToUpper();

        var consultor = await conn.QueryFirstOrDefaultAsync<dynamic>(@"
            SELECT c.IdConsultor, c.NombreCompleto, c.Contrasena, c.Activo,
                   r.NombreRol
            FROM   CRM.Consultor c
            LEFT   JOIN CRM.Rol  r ON r.IdRol = c.IdRol
            WHERE  UPPER(c.Usuario) = @Usuario",
            new { Usuario = usuarioNorm });

        if (consultor == null)
        {
            _logger.LogWarning("Login fallido: usuario '{U}' no existe", usuarioNorm);
            return new LoginResponse { Ok = false, Msg = "Usuario o contraseña incorrectos." };
        }

        if (!(bool)consultor.Activo)
            return new LoginResponse { Ok = false, Msg = "Tu cuenta está inactiva. Contacta al administrador." };

        // Comparar hash (ambos en mayúsculas)
        string hashGuardado = ((string?)consultor.Contrasena ?? "").ToUpper();
        string hashRecibido  = req.PasswordHash.Trim().ToUpper();

        if (hashGuardado != hashRecibido)
        {
            _logger.LogWarning("Login fallido: password incorrecto para '{U}'", usuarioNorm);
            return new LoginResponse { Ok = false, Msg = "Usuario o contraseña incorrectos." };
        }

        _logger.LogInformation("Login exitoso: {N} (Rol: {R})", (string)consultor.NombreCompleto, (string?)consultor.NombreRol ?? "Sin Rol");

        return new LoginResponse
        {
            Ok          = true,
            Nombre      = consultor.NombreCompleto,
            Rol         = consultor.NombreRol ?? "Consultor",
            IdConsultor = (int)consultor.IdConsultor,
            Msg         = "OK"
        };
    }
}
