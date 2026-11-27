# render-kit/vehicle

Un vehículo (camión con semirremolque, tractor con implemento, cosechadora con carro…)
circulando por una ruta infinita, con "Ver en acción" que primero frena y después anima.
Todo lo de esta carpeta es independiente del producto: no conoce semirremolques.

## Piezas

| Archivo | Qué hace |
|---|---|
| `road.ts` | `RoadPath`: eje de la ruta `z = zc(x)` con curvas suaves y largas, **periódico** (por defecto 1200 m). Da posición, pendiente, curvatura y rumbo, y el mismo eje en GLSL (`roadZ`, `roadDZ`). |
| `kinematics.ts` | `TruckKinematics`: velocidad con aceleración y frenado limitados (frenado planificado con perfil suave: de 80 a 0 en ≈5,5 s, la desaceleración vuelve a cero al parar), carril / banquina con cambio de carril que **avanza con la distancia recorrida** (parado no se corre de costado; el rumbo sale de la pendiente del perfil y gira como mucho `maxYawPerMeter` por metro, sin saltos; si se pide frenar casi parado y a medio cambio de carril, avanza despacio hasta poder terminarlo), **modelo de remolque** en el perno rey, ángulo de las ruedas (sin patinar), suspensión (cabeceo, rolido, vibración; la neumática más suave) y modo manual con **modelo de bicicleta**. Pura, sin three.js: se testea en Node. |
| `actionMachine.ts` | `ActionMachine`: CIRCULANDO → FRENANDO → DETENIDO → ABRIENDO → ABIERTO → CERRANDO → DETENIDO → ARRANCANDO → CIRCULANDO. Pura. |
| `roadInstancing.ts` | Objetos que pasan junto al vehículo (postes, alambrado, cultivo, postes de luz): `roadInstances(geometría, items)` + `roadFollow(material, ruta, uniforms, ventana)`. Se ubican y se reciclan **en el vertex shader** (sin tocar la CPU); incluye el material de sombra equivalente. |
| `input.ts` | Teclado (W/S/A/D y flechas) y joystick táctil para el modo "Manejar". |

## La idea central: el vehículo queda en el origen y se mueve el mundo

Las coordenadas nunca crecen (sin errores de precisión en la GPU):

- La abscisa recorrida `s` se enrolla al período de la ruta. Todas las escalas de textura
  del suelo y el espaciado de los objetos **dividen al período**, así el enrollado no se ve.
- El suelo es un disco centrado en el vehículo; el shader calcula las coordenadas del mundo
  sumando `uTravel = (s, zc(s))` y dibuja asfalto, demarcación, banquina y campo según la
  distancia al eje.
- Los objetos instanciados usan `mod(u − s, ventana)`: el que queda atrás reaparece adelante.
- Lo que está muy lejos (árboles del horizonte, impostores) se recicla con el odómetro
  (doble precisión en la CPU) módulo 1500 m, fuera de la bruma.
- La luz con sombra apunta al origen: el encuadre de sombras "sigue" al vehículo solo.

## Cómo se arma el conjunto

```ts
const kin = new TruckKinematics({ trailerL, hitch, trailerWheelR, tractorWheelR, tractorFrontWheelR, airSuspension });
const pose = kin.step(dt);           // dt acotado a 0,1 s
// Semi y tractor articulados en el perno rey (marco local, rumbos absolutos):
place(trailer, pose.kingpin, pose.psiTrailer);   // root.position = K − R(ψ)·(kingpinX, 0, 0); root.rotation.y = −ψ
place(tractor, pose.kingpin, pose.psiTractor);
trailer.setWheelRoll(pose.wheelAngle.trailer);   // ω = v / r
trailer.setBody(pose.body.pitch, pose.body.roll, pose.body.heave);
uniforms.uTravel.value.set(pose.s, road.z(pose.s));
```

`trailerL` = distancia perno rey – centro del grupo de ejes (sale de la configuración: si
cambia el largo o los ejes, cambia el seguimiento en curva). `hitch` = cuánto está el perno
rey por delante del centro de los ejes traseros del tractor.

## Máquina de estados

```ts
const m = new ActionMachine({
  onCommand: (c) => { /* 'frenar' | 'abrir' | 'cerrar' | 'arrancar' | 'cerrarYa' */ },
  onState: (s) => ui.setState(s),
});
m.toggle();                 // botón "Ver en acción" / "Volver a cerrar"
m.update(dt, { stopped, opened, closed, cruising });
m.stopAndHold();            // p. ej. ir a "Tu marca": se cierra y queda detenido
m.closeImmediately();       // cambio de tipo con el equipo abierto
m.start();                  // "Arrancar" (con movimiento reducido arranca detenido)
```

Reglas: la animación nunca empieza con el vehículo en movimiento (el pedido se guarda hasta
DETENIDO); los toques durante una transición se ignoran; "Volver a cerrar" cierra, espera
1 s y arranca; cambiar opciones está permitido en cualquier estado.

## En la app de semirremolques

`src/three/RouteController.tsx` une todo esto con el modelo, el tractor, las luces
(posición, freno, giros, balizas), la cámara (seguimiento con resorte, lateral, dron;
órbita relativa al camión y regreso suave al soltar), el render continuo solo mientras algo
se mueve y la UI (estados del botón, "Arrancar", "Manejar"). `src/three/Route.tsx` es la
escena.

## Para reusarlo en maquinaria agrícola

- Otra ruta: `new RoadPath({ period, waves })` (que las longitudes de onda dividan al período).
- Un tractor con implemento de tiro: mismo modelo de remolque, con `hitch` = distancia del
  enganche al eje trasero del tractor y `trailerL` = enganche – eje del implemento.
- Una máquina sin remolque: usar `psiTractor` y las ruedas; ignorar el semi.
- Las acciones (abrir tolva, desplegar barra, plegar cabezal) se conectan en `onCommand`.
