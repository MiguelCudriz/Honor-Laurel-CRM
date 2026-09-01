# CRM Oportunidades API — v3.0

Backend en **.NET 8 Web API** para el registro y seguimiento de oportunidades comerciales.  
Reemplaza el flujo manual del Excel FORECAST conectándose directamente a la base de datos `CRM_Oportunidades` (SQL Server).

---

## Estructura del proyecto

```
CRM.Api/
├── Controllers/
│   └── OportunidadController.cs   ← Todos los endpoints REST
├── Data/
│   └── CrmDbContext.cs            ← Fábrica de conexiones (Dapper)
├── DTOs/
│   └── OportunidadDtos.cs         ← Request/Response models
├── Middleware/
│   └── GlobalExceptionMiddleware.cs
├── Services/
│   └── OportunidadService.cs      ← Lógica de negocio + acceso a datos
├── Properties/
│   └── launchSettings.json
├── appsettings.json               ← ⚠ Configurar connection string aquí
├── appsettings.Development.json
├── Program.cs                     ← Entry point + DI + pipeline
└── CRM.Api.csproj
```

---

## Pre-requisitos

| Herramienta | Versión mínima |
|---|---|
| .NET SDK | 8.0 |
| SQL Server | 2019+ |
| Base de datos | `CRM_Oportunidades` creada con el script v3.0 |

---

## Configuración

### 1. Connection String

Editar `appsettings.json`:

```json
"ConnectionStrings": {
  "CRM": "Server=TU_SERVIDOR;Database=CRM_Oportunidades;Trusted_Connection=True;TrustServerCertificate=True;"
}
```

**Opciones comunes:**

```
// Windows Auth (recomendado en dominio)
Server=localhost;Database=CRM_Oportunidades;Trusted_Connection=True;TrustServerCertificate=True;

// SQL Auth (usuario y contraseña)
Server=localhost;Database=CRM_Oportunidades;User Id=sa;Password=TuPassword;TrustServerCertificate=True;

// Instancia nombrada
Server=MIPC\SQLEXPRESS;Database=CRM_Oportunidades;Trusted_Connection=True;TrustServerCertificate=True;
```

### 2. CORS (origen de la interfaz web)

Editar `appsettings.json`:

```json
"Cors": {
  "Origins": [ "http://localhost:5500", "http://127.0.0.1:5500" ]
}
```

---

## Ejecutar

```bash
cd CRM.Api
dotnet restore
dotnet run
```

Abrir Swagger: **http://localhost:5000/swagger**

---

## Endpoints disponibles

### Catálogos (para dropdowns de la interfaz)
| Método | URL | Descripción |
|---|---|---|
| GET | `/api/catalogos/tipos-cliente` | NUEVO / ACTUAL |
| GET | `/api/catalogos/sectores-economicos` | 20 sectores |
| GET | `/api/catalogos/consultores` | Consultores activos |
| GET | `/api/catalogos/servicios` | Portafolio de servicios |
| GET | `/api/catalogos/modalidades` | FIJO / OCASIONAL |
| GET | `/api/catalogos/fases-venta` | Pipeline completo |
| GET | `/api/catalogos/municipios?filtro=medellin` | Búsqueda parcial |

### Clientes
| Método | URL | Descripción |
|---|---|---|
| GET | `/api/clientes/buscar?criterio=ECOPETROL` | Autocomplete NIT/Razón social |

### Oportunidades
| Método | URL | Descripción |
|---|---|---|
| GET | `/api/oportunidades` | Pipeline actual completo |
| GET | `/api/oportunidades?consultor=KAREN VARGAS` | Filtrado por consultor |
| GET | `/api/oportunidades/{numeroCotizacion}` | Detalle + historial |
| GET | `/api/oportunidades/pipeline-consultor` | Resumen por embudo |
| GET | `/api/oportunidades/winrate?anio=2025` | Win rate por trimestre |
| POST | `/api/oportunidades` | **Crear nueva oportunidad** |
| POST | `/api/oportunidades/actualizar-fase` | **Mover en el pipeline** |

---

## Ejemplo: Crear oportunidad (POST)

```json
POST /api/oportunidades
{
  "nit": "900123456",
  "razonSocial": "ECOPETROL S.A.",
  "idTipoCliente": 2,
  "idSectorEconomico": 10,
  "numeroCotizacion": "DEN095-MB051125",
  "idConsultor": 1,
  "idMunicipio": 1001,
  "idServicio": 2,
  "idModalidad": 1,
  "esLicitacion": false,
  "tiempoMeses": 12,
  "fechaInicioServicio": "2025-06-01",
  "fechaFinServicio": "2026-05-31",
  "fechaCierreEstimada": "2025-05-15",
  "fecha": "2025-04-09",
  "idFaseVenta": 4,
  "valorMensual": 15000000,
  "costo": 12000000,
  "observacion": "Cliente contactado por referido. Interés en guardas de seguridad."
}
```

## Ejemplo: Actualizar fase (POST)

```json
POST /api/oportunidades/actualizar-fase
{
  "numeroCotizacion": "DEN095-MB051125",
  "idConsultor": 1,
  "fecha": "2025-04-20",
  "idFaseVenta": 5,
  "valorMensual": 15000000,
  "costo": 11500000,
  "observacion": "Visita realizada. Cliente solicita ajuste en precio."
}
```

---

## Notas importantes

- `TiempoMeses` es **obligatorio** para FIJO y OCASIONAL (regla de negocio v3).
- `NumeroCotizacion` se normaliza automáticamente a mayúsculas en el SP.
- El historial es **inmutable**: nunca se modifica un movimiento existente.
- `PorcentajeAIU` es una columna computada en SQL Server; no se envía desde la API.
- Los errores del SP (THROW 500xx) se traducen a HTTP semánticos (400, 404, 409).
