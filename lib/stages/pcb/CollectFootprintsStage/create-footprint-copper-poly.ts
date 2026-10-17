import type { PcbSmtPadPolygon } from "circuit-json"
import { type FpPoly, PtsArc, Xy } from "kicadts"
import {
  applyToPoint,
  compose,
  rotateDEG,
  translate,
} from "transformation-matrix"
import type {
  ConverterContext,
  FootprintPlacement,
  Point,
} from "../../../types"
import { approximateArcPoints } from "../arc-utils"
import { mapKicadLayerToLayerRef } from "../layer-mapping"

export function createFootprintCopperPoly(options: {
  ctx: ConverterContext
  poly: FpPoly
  componentId: string
  footprintPlacement: FootprintPlacement
}) {
  const { ctx, poly, componentId, footprintPlacement } = options
  if (!ctx.k2cMatPcb) return

  const strokeWidth = poly.stroke?.width ?? poly.width ?? 0
  if (strokeWidth > 0) {
    ctx.warnings ??= []
    ctx.warnings.push(
      `Copper footprint polygon on ${poly.layer?.names.join(" ")}: outline stroke (${strokeWidth}mm) is not supported and was not imported.`,
    )
  }
  if (!poly.fill?.filled) return

  const points: Point[] = []
  for (const point of poly.points?.points ?? []) {
    if (point instanceof Xy) {
      points.push({ x: point.x, y: point.y })
    } else if (
      point instanceof PtsArc &&
      point.start &&
      point.mid &&
      point.end
    ) {
      points.push(
        ...approximateArcPoints({
          start: point.start,
          mid: point.mid,
          end: point.end,
        }),
      )
    }
  }
  if (points.length < 3) return

  const footprintToCircuitJsonTransform = compose(
    ctx.k2cMatPcb,
    translate(
      footprintPlacement.kicadComponentPos.x,
      footprintPlacement.kicadComponentPos.y,
    ),
    rotateDEG(-footprintPlacement.componentCcwRotationDegrees),
  )
  const copperPolygon: Omit<PcbSmtPadPolygon, "type" | "pcb_smtpad_id"> = {
    pcb_component_id: componentId,
    shape: "polygon",
    points: points.map((point) =>
      applyToPoint(footprintToCircuitJsonTransform, point),
    ),
    layer: mapKicadLayerToLayerRef(poly.layer),
    port_hints: [],
  }
  ctx.db.pcb_smtpad.insert(copperPolygon)
  const maskWarning =
    "Copper footprint polygon solder-mask coverage is not imported."
  ctx.warnings ??= []
  if (!ctx.warnings.includes(maskWarning)) {
    ctx.warnings.push(maskWarning)
  }
  if (ctx.stats) {
    ctx.stats.pads = (ctx.stats.pads ?? 0) + 1
  }
}
