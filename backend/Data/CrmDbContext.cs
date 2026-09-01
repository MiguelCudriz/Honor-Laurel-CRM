using Microsoft.Data.SqlClient;
using System.Data;

namespace CRM.Api.Data;

/// <summary>
/// Fábrica de conexiones a SQL Server.
/// Inyectada como Scoped para que cada request HTTP obtenga
/// su propia conexión y se cierre al finalizar.
/// </summary>
public class CrmDbContext
{
    private readonly string _connectionString;

    public CrmDbContext(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("CRM")
            ?? throw new InvalidOperationException(
                "ConnectionString 'CRM' no encontrada en appsettings.json");
    }

    /// <summary>
    /// Abre y retorna una conexión SQL lista para usar.
    /// El llamador es responsable de hacer Dispose (using statement).
    /// </summary>
    public IDbConnection CreateConnection()
    {
        var conn = new SqlConnection(_connectionString);
        conn.Open();
        return conn;
    }
}
