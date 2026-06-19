# Contrato de Acceso a Reportes de Datos Agregados Anónimos

> **DESCARGO:** Esta plantilla es orientativa y NO constituye asesoramiento jurídico.
> Debe ser revisada y adaptada por un abogado antes de su uso comercial.
>
> Versión 1.0 — 2026-06-19

---

## CONTRATO DE LICENCIA DE USO DE REPORTES ESTADÍSTICOS ANÓNIMOS

**En {{CIUDAD_CONTRATO}}, a {{FECHA_FIRMA}}**

### PARTES

**PARTE PROVEEDORA:**

**{{NOMBRE_EMPRESA_PLATAFORMA}}**, con CIF {{CIF_PLATAFORMA}}, domicilio social en
{{DOMICILIO_PLATAFORMA}}, inscrita en el Registro Mercantil de {{RM_CIUDAD}}, Tomo {{RM_TOMO}},
Folio {{RM_FOLIO}}, Hoja {{RM_HOJA}}, en adelante **"el Proveedor"**, representada en este
acto por D./D.ª {{NOMBRE_REPRESENTANTE_PROVEEDOR}}, con DNI/NIE {{DNI_REPRESENTANTE}}, en
calidad de {{CARGO_REPRESENTANTE}}.

**PARTE COMPRADORA:**

**{{NOMBRE_AGENCIA}}**, con CIF {{CIF_AGENCIA}}, domicilio social en {{DOMICILIO_AGENCIA}},
inscrita en el Registro Mercantil de {{RM_CIUDAD_AGENCIA}}, en adelante **"la Agencia"**,
representada por D./D.ª {{NOMBRE_REPRESENTANTE_AGENCIA}}, con DNI/NIE {{DNI_REP_AGENCIA}},
en calidad de {{CARGO_REP_AGENCIA}}.

Ambas partes se reconocen mutuamente capacidad jurídica y de obrar suficiente para suscribir
el presente contrato y, al efecto:

---

### EXPONEN

**I.** El Proveedor opera una plataforma tecnológica que, con el consentimiento expreso e
informado de sus usuarios, genera reportes estadísticos **agregados y anonimizados** de
patrones de comportamiento. Los reportes no contienen datos personales en el sentido del
art. 4.1 del Reglamento (UE) 2016/679 (RGPD), al aplicar técnicas de anonimización que
hacen imposible o inviable la reidentificación de los individuos subyacentes.

**II.** La Agencia desea acceder a dichos reportes estadísticos para fines de análisis de
mercado, segmentación de audiencias u otros usos de investigación comercial propios de su
actividad, y acepta expresamente las condiciones y restricciones establecidas en este contrato.

**III.** Las partes acuerdan que los reportes objeto del contrato son **información estadística
anónima** y no dato personal, por lo que el presente es un contrato **mercantil de licencia
de uso de información**, sin perjuicio de las garantías y prohibiciones aquí establecidas.

---

### CLÁUSULAS

#### 1. OBJETO

1.1. El Proveedor concede a la Agencia una **licencia no exclusiva, intransferible y limitada**
para acceder, descargar y usar los reportes estadísticos anónimos descritos en el **Anexo I**
(Catálogo de Reportes y Precios), en los términos y con las restricciones de este contrato.

1.2. La licencia es válida únicamente para los usos internos de la Agencia y los proyectos
de sus clientes directos, siempre que estos no reciban los datos en bruto sino únicamente
análisis o insights derivados.

#### 2. NATURALEZA ANÓNIMA DE LOS DATOS. GARANTÍAS DEL PROVEEDOR

2.1. El Proveedor garantiza que todos los reportes entregados cumplen, como mínimo:
- **K-anonimato con k ≥ 50**: ningún conjunto de atributos en el reporte identifica a
  menos de 50 individuos distintos.
- Ausencia de datos directamente identificativos (nombre, DNI, email, teléfono, dirección).
- Ausencia de datos indirectamente identificativos que, solos o combinados, permitan
  la identificación de una persona física con esfuerzo razonable.

2.2. El Proveedor certifica que los usuarios cuyos datos subyacen a los reportes han
prestado **consentimiento explícito, libre, específico e informado** para la inclusión
de sus datos en reportes anónimos comercializados.

2.3. El Proveedor mantendrá disponible, a requerimiento de autoridad competente, la
documentación de los mecanismos de anonimización aplicados.

#### 3. OBLIGACIONES Y PROHIBICIONES DE LA AGENCIA

3.1. La Agencia se obliga expresamente a:

a) Usar los reportes **exclusivamente para los fines declarados** en el Anexo II (Finalidad
   de Uso Declarada), que forma parte de este contrato.

b) **No intentar reidentificar** a ningún individuo a partir de los reportes, ya sea
   directamente, mediante cruce con otras bases de datos, técnicas de inferencia, machine
   learning u otros métodos. Esta prohibición es **absoluta e irrenunciable**.

c) **No ceder, sublicenciar, vender ni compartir** los reportes en bruto a terceros sin
   consentimiento previo y escrito del Proveedor.

d) Implementar **medidas de seguridad adecuadas** para proteger los archivos descargados
   (control de acceso, cifrado en reposo si contienen datos sensibles de negocio).

e) Notificar al Proveedor **de inmediato** (máx. 24 horas) si detecta cualquier posibilidad
   de reidentificación o vulnerabilidad en los reportes recibidos.

f) Conservar los reportes únicamente durante el plazo necesario para el uso licenciado,
   borrándolos cuando ya no sean necesarios o a requerimiento del Proveedor.

3.2. La Agencia declara y garantiza que los usos previstos de los reportes cumplen con
la normativa vigente aplicable a su actividad, incluida la normativa de publicidad,
competencia desleal y protección de datos.

#### 4. PRECIO Y FORMA DE PAGO

4.1. Los precios de cada tipo de reporte se establecen en el **Anexo I**. El precio se
devenga en el momento del acceso/descarga del reporte.

4.2. El pago se realizará mediante {{MÉTODO_PAGO}} (Stripe u otro sistema acordado),
con factura emitida por el Proveedor conforme a la normativa fiscal española.

4.3. Los precios no incluyen el IVA aplicable, que se repercutirá conforme a la
normativa vigente.

4.4. En caso de impago, el Proveedor podrá suspender el acceso de la Agencia con
preaviso de {{DIAS_PREAVISO_IMPAGO}} días hábiles, sin perjuicio de las acciones
legales que correspondan.

#### 5. REPARTO CON USUARIOS Y TRANSPARENCIA

5.1. El Proveedor informa a la Agencia de que, del precio pagado por cada reporte, el
**{{PORCENTAJE_USUARIO}} %** se distribuye entre los usuarios que han prestado consentimiento
para la venta, conforme al modelo de negocio de la plataforma. Esta información es
pública y no afecta a las obligaciones de la Agencia.

#### 6. AUDITORÍA Y CUMPLIMIENTO

6.1. El Proveedor se reserva el derecho de **auditar el uso** que la Agencia hace de
los reportes, con preaviso de {{DIAS_PREAVISO_AUDITORIA}} días hábiles, una vez al año
como máximo, para verificar el cumplimiento de este contrato.

6.2. La Agencia colaborará en dicha auditoría y proporcionará la documentación razonable
que acredite el uso conforme a lo pactado.

6.3. En caso de incumplimiento grave (especialmente intento de reidentificación o cesión
no autorizada), el Proveedor podrá **resolver el contrato de forma inmediata** y reclamar
daños y perjuicios.

#### 7. RESPONSABILIDAD

7.1. El Proveedor no será responsable de los usos que la Agencia haga de los reportes
más allá de los permitidos en este contrato.

7.2. La responsabilidad máxima del Proveedor por cualquier reclamación derivada del
presente contrato quedará limitada al importe pagado por la Agencia en los **6 meses
anteriores** al hecho generador de la reclamación.

7.3. Ninguna de las partes será responsable por daños indirectos, lucro cesante o
pérdida de negocio derivados del incumplimiento contractual.

#### 8. CONFIDENCIALIDAD

8.1. Ambas partes se obligan a mantener en estricta confidencialidad la información
técnica, comercial y de negocio que se intercambien en el marco de este contrato,
durante su vigencia y **3 años después** de su extinción.

8.2. Esta obligación no aplica a información que sea de dominio público o que la parte
receptora ya conociera con anterioridad, acreditándolo documentalmente.

#### 9. DURACIÓN Y RESOLUCIÓN

9.1. El presente contrato tendrá una duración inicial de **{{DURACIÓN_INICIAL}}** a contar
desde la fecha de firma, renovándose automáticamente por periodos de **{{PERIODO_RENOVACIÓN}}**
salvo denuncia escrita con {{DIAS_PREAVISO_RESOLUCIÓN}} días de antelación.

9.2. Cualquiera de las partes podrá resolver el contrato por incumplimiento grave de la
otra, con efecto inmediato, previa notificación fehaciente detallando el incumplimiento.

#### 10. LEGISLACIÓN APLICABLE Y JURISDICCIÓN

10.1. Este contrato se rige por la ley española.

10.2. Para cualquier controversia, las partes se someten a los Juzgados y Tribunales de
**{{CIUDAD_JURISDICCIÓN}}**, con renuncia expresa a cualquier otro fuero que pudiera corresponderles.

---

### ANEXO I — CATÁLOGO DE REPORTES Y PRECIOS

| Tipo de Reporte | Descripción | Periodicidad | Precio (€ + IVA) |
|---|---|---|---|
| {{TIPO_REPORTE_1}} | {{DESCRIPCION_1}} | {{PERIODICIDAD_1}} | {{PRECIO_1}} |
| {{TIPO_REPORTE_2}} | {{DESCRIPCION_2}} | {{PERIODICIDAD_2}} | {{PRECIO_2}} |

---

### ANEXO II — FINALIDAD DE USO DECLARADA POR LA AGENCIA

La Agencia declara que usará los reportes exclusivamente para:

{{DESCRIPCIÓN_FINALIDAD_USO_AGENCIA}}

---

**Firmado en {{CIUDAD_CONTRATO}}, a {{FECHA_FIRMA}}**

| Por el Proveedor | Por la Agencia |
|---|---|
| {{NOMBRE_REPRESENTANTE_PROVEEDOR}} | {{NOMBRE_REPRESENTANTE_AGENCIA}} |
| {{CARGO_REPRESENTANTE}} | {{CARGO_REP_AGENCIA}} |
| Firma: _________________ | Firma: _________________ |
