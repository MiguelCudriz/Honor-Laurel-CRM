using CRM.Api.Data;
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

// Controladores + validación de modelos automática
builder.Services.AddControllers()
    .ConfigureApiBehaviorOptions(opt =>
    {
        // Retorna 400 automáticamente si el modelo no pasa validación
        opt.SuppressModelStateInvalidFilter = false;
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
