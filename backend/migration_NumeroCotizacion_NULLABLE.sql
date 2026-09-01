/* ================================================================
   MIGRATION: CRM_Oportunidades
   Objetivo: NumeroCotizacion pasa a ser OPCIONAL (NULL permitido)
   Objetos afectados (imagen de análisis de impacto):
     1. CRM.Oportunidad              — tabla base
     2. CRM.SP_CrearOportunidad      — SP escritura
     3. CRM.SP_AsignarNumeroCotizacion — SP nuevo
     4. CRM.SP_ActualizarFaseOportunidad — SP movimiento
     5-6.  CRM.VW_DetalleMovimiento    — vista base
     7-8.  CRM.VW_HistorialOportunidades — vista historial
     9-10. CRM.VW_OportunidadesActuales — vista vigente

   EJECUTAR EN ORDEN, en una ventana de SQL Server Management Studio.
   ================================================================ */

USE [CRM_Oportunidades];
GO
SET NOCOUNT ON;
GO

PRINT '=== INICIO MIGRACIÓN: NumeroCotizacion NULLABLE ===';
PRINT '';
GO

/* ================================================================
   PASO 1 — Modificar tabla CRM.Oportunidad
   ================================================================ */
PRINT '--- PASO 1: Modificando tabla CRM.Oportunidad ---';
GO

-- 1a. Quitar CHECK que exige contenido mínimo de 1 char
IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_Oportunidad_Cotizacion'
             AND parent_object_id = OBJECT_ID('CRM.Oportunidad'))
BEGIN
    ALTER TABLE [CRM].[Oportunidad] DROP CONSTRAINT [CK_Oportunidad_Cotizacion];
    PRINT '  OK - CHECK CK_Oportunidad_Cotizacion eliminado';
END
ELSE
    PRINT '  SKIP - CK_Oportunidad_Cotizacion no existia';
GO

-- 1b. Quitar UNIQUE constraint (lo reemplazamos con índice filtrado)
IF EXISTS (SELECT 1 FROM sys.key_constraints
           WHERE name = 'UQ_Oportunidad_NumeroCotizacion'
             AND parent_object_id = OBJECT_ID('CRM.Oportunidad'))
BEGIN
    ALTER TABLE [CRM].[Oportunidad] DROP CONSTRAINT [UQ_Oportunidad_NumeroCotizacion];
    PRINT '  OK - UNIQUE UQ_Oportunidad_NumeroCotizacion eliminado';
END
ELSE
    PRINT '  SKIP - UQ_Oportunidad_NumeroCotizacion no existia';
GO

-- 1c. Quitar índice filtrado si ya existía de una migración anterior
IF EXISTS (SELECT 1 FROM sys.indexes
           WHERE name = 'UQ_Oportunidad_NumeroCotizacion_Filtrado'
             AND object_id = OBJECT_ID('CRM.Oportunidad'))
BEGIN
    DROP INDEX [UQ_Oportunidad_NumeroCotizacion_Filtrado] ON [CRM].[Oportunidad];
    PRINT '  OK - Índice filtrado previo eliminado';
END
GO

-- 1d. Cambiar columna a NULL
ALTER TABLE [CRM].[Oportunidad]
    ALTER COLUMN [NumeroCotizacion] [varchar](30) NULL;
PRINT '  OK - NumeroCotizacion ahora es NULLABLE';
GO

-- 1e. Crear índice único FILTRADO: valores no-nulos deben ser únicos;
--     múltiples NULLs son permitidos (comportamiento estándar SQL Server).
CREATE UNIQUE NONCLUSTERED INDEX [UQ_Oportunidad_NumeroCotizacion_Filtrado]
    ON [CRM].[Oportunidad] ([NumeroCotizacion])
    WHERE [NumeroCotizacion] IS NOT NULL;
PRINT '  OK - Índice único filtrado creado (NULLs permitidos, no-NULLs únicos)';
GO

PRINT '--- PASO 1 COMPLETADO ---';
PRINT '';
GO

/* ================================================================
   PASO 2 — SP_CrearOportunidad
   Cambios:
     - @NumeroCotizacion nullable (NULL por defecto)
     - @FechaCierreEstimada eliminado (columna sigue en tabla, no se usa en UI)
     - Permite crear sin cotización
   NOTA: Ajusta la tabla de movimientos si no se llama CRM.MovimientoPipeline
   ================================================================ */
PRINT '--- PASO 2: Actualizando SP_CrearOportunidad ---';
GO

CREATE OR ALTER PROCEDURE [CRM].[SP_CrearOportunidad]
    -- Cliente
    @NIT                  varchar(20)    = NULL,
    @RazonSocial          varchar(200),
    @IdSectorEconomico    smallint,
    -- Oportunidad
    @NumeroCotizacion     varchar(30)    = NULL,   -- OPCIONAL
    @IdConsultor          smallint,
    @IdMunicipio          int,
    @IdServicio           smallint,
    @IdModalidad          tinyint,
    @IdTipoCliente        tinyint,
    @EsLicitacion         bit            = 0,
    @TiempoMeses          tinyint,
    @FechaInicioServicio  date           = NULL,
    @FechaFinServicio     date           = NULL,
    -- Primer movimiento
    @Fecha                date,
    @IdFaseVenta          tinyint,
    @ValorMensual         decimal(18,2),
    @Costo                decimal(18,2),
    @Observacion          nvarchar(4000) = NULL,
    -- Output
    @IdOportunidadOut     int            OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    /* ── Validaciones de negocio ──────────────────────────────────── */
    IF @TiempoMeses IS NULL OR @TiempoMeses <= 0
        THROW 50015, 'TiempoMeses es obligatorio y debe ser mayor a 0.', 1;

    IF @Costo > @ValorMensual
        THROW 50014, 'El Costo no puede superar el ValorMensual.', 1;

    /* Normalizar cotización: string vacío → NULL, valores → UPPER */
    IF @NumeroCotizacion IS NOT NULL
        SET @NumeroCotizacion = UPPER(LTRIM(RTRIM(@NumeroCotizacion)));
    IF @NumeroCotizacion = ''
        SET @NumeroCotizacion = NULL;

    BEGIN TRANSACTION;
    BEGIN TRY

        /* ── Upsert cliente ──────────────────────────────────────────── */
        DECLARE @NombreNorm varchar(200) =
            UPPER(REPLACE(REPLACE(LTRIM(RTRIM(@RazonSocial)), '.', ''), ' ', ''));

        DECLARE @IdCliente int;
        SELECT TOP 1 @IdCliente = IdCliente
        FROM   CRM.Cliente
        WHERE  NombreNormalizado = @NombreNorm
          AND  Activo = 1
        ORDER  BY IdCliente;

        IF @IdCliente IS NULL
        BEGIN
            INSERT INTO CRM.Cliente (NIT, RazonSocial, NombreNormalizado, IdSectorEconomico)
            VALUES (@NIT, UPPER(LTRIM(RTRIM(@RazonSocial))), @NombreNorm, @IdSectorEconomico);
            SET @IdCliente = SCOPE_IDENTITY();
        END

        /* ── Insertar Oportunidad ─────────────────────────────────────── */
        INSERT INTO CRM.Oportunidad
               (NumeroCotizacion, IdCliente, IdConsultorOriginal, IdMunicipio,
                IdServicio, IdModalidad, EsLicitacion, FechaPrimerRegistro,
                FechaInicioServicio, FechaFinServicio, TiempoMeses,
                Activo, IdTipoCliente)
        VALUES (@NumeroCotizacion, @IdCliente, @IdConsultor, @IdMunicipio,
                @IdServicio, @IdModalidad, @EsLicitacion, @Fecha,
                @FechaInicioServicio, @FechaFinServicio, @TiempoMeses,
                1, @IdTipoCliente);

        SET @IdOportunidadOut = SCOPE_IDENTITY();

        /* ── Primer movimiento de pipeline ────────────────────────────── */
        -- Ajusta el nombre de la tabla si es diferente en tu BD
        INSERT INTO CRM.MovimientoPipeline
               (IdOportunidad, IdFaseVenta, IdConsultor,
                ValorMensual, Costo, Fecha, Observacion,
                EsVigente, FechaRegistro, UsuarioRegistro)
        VALUES (@IdOportunidadOut, @IdFaseVenta, @IdConsultor,
                @ValorMensual, @Costo, @Fecha, @Observacion,
                1, GETDATE(), SUSER_SNAME());

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

PRINT '  OK - SP_CrearOportunidad actualizado';
PRINT '--- PASO 2 COMPLETADO ---';
PRINT '';
GO

/* ================================================================
   PASO 3 — SP_AsignarNumeroCotizacion (NUEVO)
   Permite asignar o corregir el NumeroCotizacion después del registro.
   Errores de negocio:
     50001 — Oportunidad no encontrada
     50010 — NumeroCotizacion vacío
     50011 — NumeroCotizacion ya existe en otra oportunidad
   ================================================================ */
PRINT '--- PASO 3: Creando SP_AsignarNumeroCotizacion ---';
GO

CREATE OR ALTER PROCEDURE [CRM].[SP_AsignarNumeroCotizacion]
    @IdOportunidad          int,
    @NuevoNumeroCotizacion  varchar(30)
AS
BEGIN
    SET NOCOUNT ON;

    /* Normalizar */
    SET @NuevoNumeroCotizacion = UPPER(LTRIM(RTRIM(@NuevoNumeroCotizacion)));

    /* Validar que no esté vacío */
    IF @NuevoNumeroCotizacion = '' OR @NuevoNumeroCotizacion IS NULL
        THROW 50010, 'NumeroCotizacion no puede estar vacío.', 1;

    /* Validar que la oportunidad exista y esté activa */
    IF NOT EXISTS (
        SELECT 1 FROM CRM.Oportunidad
        WHERE IdOportunidad = @IdOportunidad AND Activo = 1)
        THROW 50001, 'Oportunidad no encontrada o inactiva.', 1;

    /* Validar unicidad: no puede repetirse en otra oportunidad */
    IF EXISTS (
        SELECT 1 FROM CRM.Oportunidad
        WHERE NumeroCotizacion = @NuevoNumeroCotizacion
          AND IdOportunidad   <> @IdOportunidad)
        THROW 50011, 'El NumeroCotizacion ya existe en otra oportunidad.', 1;

    UPDATE CRM.Oportunidad
    SET    NumeroCotizacion = @NuevoNumeroCotizacion
    WHERE  IdOportunidad    = @IdOportunidad;
END
GO

PRINT '  OK - SP_AsignarNumeroCotizacion creado';
PRINT '--- PASO 3 COMPLETADO ---';
PRINT '';
GO

/* ================================================================
   PASO 4 — SP_ActualizarFaseOportunidad
   Cambios:
     - Acepta @NumeroCotizacion O @IdOportunidad (cualquiera de los dos)
     - Si la oportunidad no tiene cotización, busca por @IdOportunidad
   ================================================================ */
PRINT '--- PASO 4: Actualizando SP_ActualizarFaseOportunidad ---';
GO

CREATE OR ALTER PROCEDURE [CRM].[SP_ActualizarFaseOportunidad]
    @NumeroCotizacion   varchar(30)    = NULL,   -- puede ser null si oportunidad sin cotización
    @IdOportunidad      int            = NULL,   -- fallback cuando no hay cotización
    @IdConsultor        smallint,
    @Fecha              date,
    @IdFaseVenta        tinyint,
    @ValorMensual       decimal(18,2),
    @Costo              decimal(18,2),
    @Observacion        nvarchar(4000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    /* Normalizar cotización */
    IF @NumeroCotizacion IS NOT NULL
        SET @NumeroCotizacion = UPPER(LTRIM(RTRIM(@NumeroCotizacion)));
    IF @NumeroCotizacion = ''
        SET @NumeroCotizacion = NULL;

    /* ── Resolver IdOportunidad ─────────────────────────────────── */
    DECLARE @IdOp int;

    IF @NumeroCotizacion IS NOT NULL
    BEGIN
        -- Búsqueda por cotización (caso normal)
        SELECT @IdOp = IdOportunidad
        FROM   CRM.Oportunidad
        WHERE  NumeroCotizacion = @NumeroCotizacion
          AND  Activo = 1;
    END

    IF @IdOp IS NULL AND @IdOportunidad IS NOT NULL
    BEGIN
        -- Fallback: buscar por IdOportunidad (oportunidades sin cotización)
        SELECT @IdOp = IdOportunidad
        FROM   CRM.Oportunidad
        WHERE  IdOportunidad = @IdOportunidad
          AND  Activo = 1;
    END

    IF @IdOp IS NULL
        THROW 50001, 'Oportunidad no encontrada o inactiva.', 1;

    /* ── Validaciones ──────────────────────────────────────────── */
    IF @Costo > @ValorMensual
        THROW 50014, 'El Costo no puede superar el ValorMensual.', 1;

    IF EXISTS (
        SELECT 1 FROM CRM.MovimientoPipeline
        WHERE  IdOportunidad = @IdOp
          AND  IdFaseVenta   = @IdFaseVenta
          AND  Fecha         = @Fecha)
        THROW 50003, 'Ya existe un movimiento con la misma fase y fecha.', 1;

    BEGIN TRANSACTION;
    BEGIN TRY
        /* Marcar movimientos anteriores como no vigentes */
        UPDATE CRM.MovimientoPipeline
        SET    EsVigente = 0
        WHERE  IdOportunidad = @IdOp
          AND  EsVigente = 1;

        /* Insertar nuevo movimiento vigente */
        INSERT INTO CRM.MovimientoPipeline
               (IdOportunidad, IdFaseVenta, IdConsultor,
                ValorMensual, Costo, Fecha, Observacion,
                EsVigente, FechaRegistro, UsuarioRegistro)
        VALUES (@IdOp, @IdFaseVenta, @IdConsultor,
                @ValorMensual, @Costo, @Fecha, @Observacion,
                1, GETDATE(), SUSER_SNAME());

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

PRINT '  OK - SP_ActualizarFaseOportunidad actualizado';
PRINT '--- PASO 4 COMPLETADO ---';
PRINT '';
GO

/* ================================================================
   PASO 5 — VW_DetalleMovimiento
   Cambios:
     - NumeroCotizacion ahora puede ser NULL (viene de la tabla)
     - Se añade IdOportunidad explícitamente al SELECT
     - El código C# ahora usa IdOportunidad para buscar el historial

   IMPORTANTE: Si tu tabla de movimientos NO se llama CRM.MovimientoPipeline,
   reemplaza ese nombre en los FROM/JOIN de abajo.
   ================================================================ */
PRINT '--- PASO 5: Actualizando VW_DetalleMovimiento ---';
GO

CREATE OR ALTER VIEW [CRM].[VW_DetalleMovimiento]
AS
SELECT
    -- Identificadores clave
    o.IdOportunidad,
    o.NumeroCotizacion,                          -- puede ser NULL

    -- Contrato
    o.TiempoMeses,
    o.FechaInicioServicio,
    o.FechaFinServicio,
    o.FechaCierreEstimada,
    o.FechaPrimerRegistro,
    o.EsLicitacion,
    o.IdTipoCliente,

    -- Cliente
    c.NIT,
    c.RazonSocial                               AS ProspectoCliente,

    -- Catálogos relacionados
    se.Descripcion                              AS SectorEconomico,
    tc.Descripcion                              AS TipoCliente,
    m.Nombre                                    AS Ciudad,
    d.Nombre                                    AS Departamento,
    r.Nombre                                    AS Region,
    sv.Nombre                                   AS Servicio,
    mc.Descripcion                              AS ModalidadContrato,

    -- Movimiento
    mp.IdMovimiento,
    mp.EsVigente,
    mp.ValorMensual,
    mp.Costo,
    mp.Observacion,
    mp.Fecha                                    AS FechaActualizacion,
    mp.FechaRegistro,
    mp.UsuarioRegistro,

    -- Fase de venta
    fv.Descripcion                              AS FaseVenta,
    fv.OrdenFunnel,
    fv.PorcentajeProbabilidad,
    fv.EsCierre,
    fv.TipoCierre,

    -- Consultor del movimiento
    co.NombreCompleto                           AS Consultor,

    -- Calculados financieros
    (mp.ValorMensual - mp.Costo)                AS AIUAbsoluto,
    CASE
        WHEN mp.ValorMensual > 0
        THEN CAST((mp.ValorMensual - mp.Costo) AS decimal(18,4))
             / mp.ValorMensual * 100.0
        ELSE 0
    END                                         AS PorcentajeAIU,
    mp.ValorMensual * o.TiempoMeses             AS MontoTotalDuracion,
    mp.ValorMensual * o.TiempoMeses
        * fv.PorcentajeProbabilidad / 100.0     AS ValorPonderado,

    -- Derivados temporales del movimiento (para filtros BI)
    DATENAME(MONTH, mp.Fecha)                   AS MesRegistro,
    YEAR(mp.Fecha)                              AS AnioRegistro,
    'Q' + CAST(CEILING(MONTH(mp.Fecha) / 3.0) AS varchar(1)) AS Trimestre

FROM CRM.MovimientoPipeline     mp          -- ajusta si el nombre es diferente
INNER JOIN CRM.Oportunidad      o  ON o.IdOportunidad      = mp.IdOportunidad
INNER JOIN CRM.Cliente          c  ON c.IdCliente          = o.IdCliente
INNER JOIN CRM.SectorEconomico  se ON se.IdSectorEconomico = c.IdSectorEconomico
INNER JOIN CRM.TipoCliente      tc ON tc.IdTipoCliente     = o.IdTipoCliente
INNER JOIN CRM.Municipio        m  ON m.IdMunicipio        = o.IdMunicipio
INNER JOIN CRM.Departamento     d  ON d.IdDepartamento     = m.IdDepartamento
INNER JOIN CRM.Region           r  ON r.IdRegion           = d.IdRegion
INNER JOIN CRM.Servicio         sv ON sv.IdServicio        = o.IdServicio
INNER JOIN CRM.ModalidadContrato mc ON mc.IdModalidad      = o.IdModalidad
INNER JOIN CRM.FaseVenta        fv ON fv.IdFaseVenta       = mp.IdFaseVenta
INNER JOIN CRM.Consultor        co ON co.IdConsultor       = mp.IdConsultor
WHERE  o.Activo = 1;
GO

PRINT '  OK - VW_DetalleMovimiento actualizada';
PRINT '--- PASO 5 COMPLETADO ---';
PRINT '';
GO

/* ================================================================
   PASO 6 — VW_HistorialOportunidades
   Expone todos los movimientos con IdOportunidad.
   El C# ahora filtra por IdOportunidad (no NumeroCotizacion).
   ================================================================ */
PRINT '--- PASO 6: Actualizando VW_HistorialOportunidades ---';
GO

CREATE OR ALTER VIEW [CRM].[VW_HistorialOportunidades]
AS
SELECT
    dm.IdOportunidad,
    dm.NumeroCotizacion,        -- puede ser NULL
    dm.IdMovimiento,
    dm.FaseVenta,
    dm.OrdenFunnel,
    dm.PorcentajeProbabilidad,
    dm.EsCierre,
    dm.TipoCierre,
    dm.Consultor,
    dm.ValorMensual,
    dm.Costo,
    dm.AIUAbsoluto,
    dm.PorcentajeAIU,
    dm.MontoTotalDuracion,
    dm.ValorPonderado,
    dm.FechaActualizacion,
    dm.MesRegistro,
    dm.AnioRegistro,
    dm.Trimestre,
    dm.EsVigente,
    dm.Observacion,
    dm.FechaRegistro,
    dm.UsuarioRegistro
FROM CRM.VW_DetalleMovimiento dm;
GO

PRINT '  OK - VW_HistorialOportunidades actualizada';
PRINT '--- PASO 6 COMPLETADO ---';
PRINT '';
GO

/* ================================================================
   PASO 7 — VW_OportunidadesActuales
   Filtra solo EsVigente=1. Expone IdOportunidad y NumeroCotizacion nullable.
   ================================================================ */
PRINT '--- PASO 7: Actualizando VW_OportunidadesActuales ---';
GO

CREATE OR ALTER VIEW [CRM].[VW_OportunidadesActuales]
AS
SELECT
    dm.IdOportunidad,
    dm.NumeroCotizacion,                        -- puede ser NULL
    dm.ProspectoCliente,
    dm.NIT,
    dm.TipoCliente,
    IIF(dm.EsLicitacion = 1, 'SÍ', 'NO')       AS Licitacion,
    dm.Consultor                                AS ConsultorActual,
    dm.SectorEconomico,
    dm.Region,
    dm.Departamento,
    dm.Ciudad,
    dm.Servicio,
    dm.ModalidadContrato,
    dm.FaseVenta,
    dm.OrdenFunnel,
    -- ProbabilidadVenta como fracción 0.0–1.0 (el C# la usa así)
    dm.PorcentajeProbabilidad / 100.0           AS ProbabilidadVenta,
    dm.EsCierre,
    dm.TipoCierre,
    dm.ValorMensual,
    dm.Costo,
    dm.AIUAbsoluto                              AS AiuAbsoluto,
    dm.PorcentajeAIU                            AS PorcentajeAiu,
    dm.MontoTotalDuracion,
    dm.ValorPonderado,
    dm.TiempoMeses,
    dm.FechaPrimerRegistro,
    dm.FechaCierreEstimada,
    dm.FechaActualizacion,
    dm.FechaInicioServicio,
    dm.FechaFinServicio,
    -- Derivados del primer registro (para filtros BI en Pipeline)
    DATENAME(MONTH, dm.FechaPrimerRegistro)     AS MesRegistro,
    YEAR(dm.FechaPrimerRegistro)                AS AnioRegistro,
    'Q' + CAST(CEILING(MONTH(dm.FechaPrimerRegistro) / 3.0) AS varchar(1)) AS Trimestre,
    DATENAME(MONTH, dm.FechaPrimerRegistro) + ' '
        + CAST(YEAR(dm.FechaPrimerRegistro) AS varchar(4)) AS MesAnio,
    dm.Observacion,
    dm.FechaActualizacion                       AS FechaUltimoMovimiento,
    dm.UsuarioRegistro                          AS UsuarioUltimoMovimiento
FROM CRM.VW_DetalleMovimiento dm
WHERE dm.EsVigente = 1;
GO

PRINT '  OK - VW_OportunidadesActuales actualizada';
PRINT '--- PASO 7 COMPLETADO ---';
PRINT '';
GO

/* ================================================================
   VERIFICACIÓN FINAL
   ================================================================ */
PRINT '--- VERIFICACIÓN ---';
GO

-- Verificar que la columna es ahora nullable
SELECT
    COLUMN_NAME,
    IS_NULLABLE,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'CRM'
  AND TABLE_NAME   = 'Oportunidad'
  AND COLUMN_NAME  = 'NumeroCotizacion';
GO

-- Verificar que el índice filtrado existe
SELECT
    i.name               AS Indice,
    i.is_unique          AS EsUnico,
    i.has_filter         AS TieneFiltro,
    i.filter_definition  AS FiltroDef
FROM sys.indexes i
WHERE i.object_id = OBJECT_ID('CRM.Oportunidad')
  AND i.name      = 'UQ_Oportunidad_NumeroCotizacion_Filtrado';
GO

-- Verificar SPs
SELECT
    ROUTINE_NAME,
    ROUTINE_TYPE
FROM INFORMATION_SCHEMA.ROUTINES
WHERE ROUTINE_SCHEMA = 'CRM'
  AND ROUTINE_NAME IN (
      'SP_CrearOportunidad',
      'SP_AsignarNumeroCotizacion',
      'SP_ActualizarFaseOportunidad')
ORDER BY ROUTINE_NAME;
GO

-- Verificar vistas
SELECT
    TABLE_NAME  AS Vista
FROM INFORMATION_SCHEMA.VIEWS
WHERE TABLE_SCHEMA = 'CRM'
  AND TABLE_NAME IN (
      'VW_DetalleMovimiento',
      'VW_HistorialOportunidades',
      'VW_OportunidadesActuales')
ORDER BY TABLE_NAME;
GO

PRINT '';
PRINT '=== MIGRACIÓN COMPLETADA EXITOSAMENTE ===';
PRINT 'IMPORTANTE: Si tu tabla de movimientos NO se llama CRM.MovimientoPipeline,';
PRINT '            busca ese nombre en este script y reemplázalo por el correcto.';
PRINT 'IMPORTANTE: Verifica los nombres de columnas de tu tabla de movimientos';
PRINT '            contra los usados en VW_DetalleMovimiento.';
GO
