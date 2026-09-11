using Microsoft.AspNetCore.Mvc;
using CRM.Api.Data;
using CRM.Api.DTOs;
using CRM.Api.Middleware;
using CRM.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// ─────────────────────────────────────────────────────────────────────────────
//  SERVICIOS
// ─────────────────────────────────────────────────────────────────────────────

builder.Services.AddScoped<CrmDbContext>();
builder.Services.AddScoped<OportunidadService>();
builder.Services.AddScoped<AuthService>();       // autenticación contra BD
builder.Services.AddScoped<ConsultorService>();  // gestión de consultores (admin)
builder.Services.AddScoped<PipelineService>(); //Servicios de indicadores
builder.Services.AddScoped<MetaService>();       // gestión de metas comerciales
builder.Services.AddScoped<CatalogoAdminService>(); // CRUD de catálogos (admin/supervisor)

// Controladores + validación de modelos automática
builder.Services.AddControllers()
    .ConfigureApiBehaviorOptions(opt =>
    {
        // Retorna 400 automáticamente si el modelo no pasa validación
        opt.SuppressModelStateInvalidFilter = false;

        // [v12] Los errores de validación se devuelven con la MISMA forma que
        // el resto de la API: { success, message, data }.
        //
        // Por defecto ASP.NET responde un ValidationProblemDetails, que trae
        // "title" y "errors" pero NO "message". El frontend lee data.message,
        // así que cualquier fallo de validación llegaba como un toast genérico
        // sin decir qué campo estaba mal. Un [Required] mal puesto costó una
        // sesión entera de diagnóstico por eso.
        opt.InvalidModelStateResponseFactory = ctx =>
        {
            var detalles = ctx.ModelState
                .Where(e => e.Value?.Errors.Count > 0)
                .Select(e =>
                {
                    var campo = string.IsNullOrEmpty(e.Key) ? "cuerpo de la petición" : e.Key;
                    var msg   = e.Value!.Errors.First().ErrorMessage;
                    if (string.IsNullOrWhiteSpace(msg)) msg = "valor no válido";
                    return $"{campo}: {msg}";
                })
                .ToArray();

            var mensaje = detalles.Length == 0
                ? "La petición no pasó la validación."
                : "Datos no válidos — " + string.Join(" · ", detalles);

            return new BadRequestObjectResult(ApiResponse<object>.Fail(mensaje));
        };
    });

// CORS — permite conexión desde la interfaz web (HTML/JS)
var origenes = builder.Configuration.GetSection("Cors:Origins").Get<string[]>()
               ?? ["http://localhost:3000"];

builder.Services.AddCors(opt =>
    opt.AddPolicy("FrontendPolicy", policy =>
        policy.WithOrigins(origenes)
              .AllowAnyHeader()
              .AllowAnyMethod()));

// Swagger / OpenAPI
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(opt =>
{
    opt.SwaggerDoc("v1", new()
    {
        Title       = "CRM Oportunidades API",
        Version     = "v1",
        Description = "Backend para el registro y seguimiento de oportunidades comerciales. " +
                      "Reemplaza el flujo manual del Excel FORECAST."
    });

    // Incluir comentarios XML si existen
    var xmlFile = $"{System.Reflection.Assembly.GetExecutingAssembly().GetName().Name}.xml";
    var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFile);
    if (File.Exists(xmlPath))
        opt.IncludeXmlComments(xmlPath);
});

// ─────────────────────────────────────────────────────────────────────────────
//  PIPELINE HTTP
// ─────────────────────────────────────────────────────────────────────────────

var app = builder.Build();

// Manejo global de errores (va primero para capturar todo)
app.UseMiddleware<GlobalExceptionMiddleware>();

// Swagger solo en desarrollo
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(opt =>
    {
        opt.SwaggerEndpoint("/swagger/v1/swagger.json", "CRM Oportunidades v1");
        opt.RoutePrefix = "swagger";
    });
}

app.UseCors("FrontendPolicy");
app.UseAuthorization();
app.MapControllers();

// Health-check mínimo para verificar que la API responde
app.MapGet("/health", () => Results.Ok(new
{
    Status    = "OK",
    Timestamp = DateTime.UtcNow,
    Version   = "3.0"
})).ExcludeFromDescription();

app.Run();
