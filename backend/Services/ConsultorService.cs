using Dapper;
using CRM.Api.Data;
using CRM.Api.DTOs;

namespace CRM.Api.Services;

public class ConsultorService
{
    private readonly CrmDbContext _db;

    public ConsultorService(CrmDbContext db) => _db = db;

    // ── Roles ──────────────────────────────────────────────────────────────────
    public async Task<IEnumerable<RolDto>> GetRolesAsync()
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<RolDto>(
            "SELECT IdRol, NombreRol FROM CRM.Rol ORDER BY NombreRol");
    }

    // ── Listar todos los consultores (incluye inactivos para el admin) ─────────
    public async Task<IEnumerable<ConsultorDto>> GetTodosAsync()
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<ConsultorDto>(@"
            SELECT c.IdConsultor, c.NombreCompleto, c.Email,
                   c.Usuario, c.Activo, c.IdRol, r.NombreRol
            FROM   CRM.Consultor c
            LEFT   JOIN CRM.Rol  r ON r.IdRol = c.IdRol
            ORDER  BY c.Activo DESC, c.NombreCompleto");
    }

    // ── Obtener uno por ID ─────────────────────────────────────────────────────
    public async Task<ConsultorDto?> GetByIdAsync(int id)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryFirstOrDefaultAsync<ConsultorDto>(@"
            SELECT c.IdConsultor, c.NombreCompleto, c.Email,
                   c.Usuario, c.Activo, c.IdRol, r.NombreRol
            FROM   CRM.Consultor c
            LEFT   JOIN CRM.Rol  r ON r.IdRol = c.IdRol
            WHERE  c.IdConsultor = @Id", new { Id = id });
    }

    // ── Crear ──────────────────────────────────────────────────────────────────
    public async Task<int> CrearAsync(CrearConsultorRequest req)
    {
        using var conn = _db.CreateConnection();

        // Verificar que el usuario no exista
        var existe = await conn.QueryFirstOrDefaultAsync<int?>(
            "SELECT IdConsultor FROM CRM.Consultor WHERE UPPER(Usuario) = @U",
            new { U = req.Usuario.ToUpper() });
        if (existe.HasValue)
            throw new InvalidOperationException($"El usuario '{req.Usuario}' ya está en uso.");

        var id = await conn.QueryFirstAsync<int>(@"
            INSERT INTO CRM.Consultor (NombreCompleto, Email, Usuario, Contrasena, IdRol, Activo)
            OUTPUT INSERTED.IdConsultor
            VALUES (@Nombre, @Email, @Usuario, @Hash, @Rol, 1)",
            new
            {
                Nombre  = req.NombreCompleto.Trim().ToUpper(),
                Email   = req.Email?.Trim().ToLower(),
                Usuario = req.Usuario.Trim().ToUpper(),
                Hash    = req.PasswordHash.Trim().ToUpper(),
                Rol     = req.IdRol
            });
        return id;
    }

    // ── Actualizar datos (sin contraseña) ──────────────────────────────────────
    public async Task ActualizarAsync(int id, ActualizarConsultorRequest req)
    {
        using var conn = _db.CreateConnection();

        // Verificar que el usuario no esté tomado por otro consultor
        var conflicto = await conn.QueryFirstOrDefaultAsync<int?>(
            "SELECT IdConsultor FROM CRM.Consultor WHERE UPPER(Usuario) = @U AND IdConsultor <> @Id",
            new { U = req.Usuario.ToUpper(), Id = id });
        if (conflicto.HasValue)
            throw new InvalidOperationException($"El usuario '{req.Usuario}' ya está en uso por otro consultor.");

        var filas = await conn.ExecuteAsync(@"
            UPDATE CRM.Consultor SET
                NombreCompleto = @Nombre,
                Email          = @Email,
                Usuario        = @Usuario,
                IdRol          = @Rol,
                Activo         = @Activo
            WHERE IdConsultor = @Id",
            new
            {
                Nombre  = req.NombreCompleto.Trim().ToUpper(),
                Email   = req.Email?.Trim().ToLower(),
                Usuario = req.Usuario.Trim().ToUpper(),
                Rol     = req.IdRol,
                Activo  = req.Activo,
                Id      = id
            });

        if (filas == 0)
            throw new KeyNotFoundException($"Consultor {id} no encontrado.");
    }

    // ── Cambiar contraseña ─────────────────────────────────────────────────────
    public async Task CambiarPasswordAsync(int id, CambiarPasswordRequest req)
    {
        using var conn = _db.CreateConnection();
        var filas = await conn.ExecuteAsync(
            "UPDATE CRM.Consultor SET Contrasena = @Hash WHERE IdConsultor = @Id",
            new { Hash = req.NuevoPasswordHash.Trim().ToUpper(), Id = id });

        if (filas == 0)
            throw new KeyNotFoundException($"Consultor {id} no encontrado.");
    }

    // ── Activar / Desactivar (borrado lógico) ──────────────────────────────────
    public async Task ToggleActivoAsync(int id, bool activo)
    {
        using var conn = _db.CreateConnection();
        var filas = await conn.ExecuteAsync(
            "UPDATE CRM.Consultor SET Activo = @A WHERE IdConsultor = @Id",
            new { A = activo, Id = id });

        if (filas == 0)
            throw new KeyNotFoundException($"Consultor {id} no encontrado.");
    }
}
