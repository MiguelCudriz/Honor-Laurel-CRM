using Microsoft.AspNetCore.Mvc;
using CRM.Api.DTOs;
using CRM.Api.Services;

namespace CRM.Api.Controllers;

[ApiController]
[Route("api/auth")]
[Produces("application/json")]
public class AuthController : ControllerBase
{
    private readonly AuthService _auth;

    public AuthController(AuthService auth) => _auth = auth;

    /// <summary>
    /// Login con usuario + SHA-256(contraseña) en hex mayúsculas.
    /// Retorna nombre, rol e IdConsultor si las credenciales son válidas.
    /// </summary>
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        if (!ModelState.IsValid)
            return BadRequest(new LoginResponse { Ok = false, Msg = "Datos inválidos." });

        var result = await _auth.LoginAsync(req);
        return result.Ok ? Ok(result) : Unauthorized(result);
    }
}
