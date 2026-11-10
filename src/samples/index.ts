import lineGraph from './line-graph.svg?raw'
import plantCell from './plant-cell.svg?raw'
import rightTriangle from './right-triangle.svg?raw'
import seriesCircuit from './series-circuit.svg?raw'

export interface Sample {
  id: string
  name: string
  /** One line for screen readers and the card. */
  about: string
  svg: string
}

/** Four diagrams drawn for this project. None is copied from a textbook. */
export const SAMPLES: readonly Sample[] = [
  {
    id: 'plant-cell',
    name: 'Plant cell',
    about: 'Five labelled parts with lead lines, colour fills and fine detail.',
    svg: plantCell,
  },
  {
    id: 'right-triangle',
    name: 'Right triangle',
    about: 'Labelled angles and sides, with one label set at a slant.',
    svg: rightTriangle,
  },
  {
    id: 'series-circuit',
    name: 'Series circuit',
    about: 'A battery, a switch and a bulb inside a decorative frame.',
    svg: seriesCircuit,
  },
  {
    id: 'line-graph',
    name: 'Line graph',
    about: 'Two axes, three plotted points and dashed guide lines.',
    svg: lineGraph,
  },
]
