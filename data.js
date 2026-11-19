// Treinos padrão.
// machineId = número da máquina no catálogo Cimerian (catalog.js); null = halteres / livre.
// muscles: p = grupos principais (conta 1 série), s = secundários (conta 0,5 série).
// alts = substitutos que podem ser trocados durante o treino.

export const DATA_VERSION = 2;

export const MUSCLES = [
  'Peito', 'Costas', 'Ombros', 'Bíceps', 'Tríceps',
  'Quadríceps', 'Posteriores', 'Glúteos', 'Adutores', 'Panturrilha',
];

export const DEFAULT_WORKOUTS = [
  {
    id: 'A',
    name: 'Treino A',
    subtitle: 'Pernas',
    exercises: [
      { id: 'a1', name: 'Agachamento Hack', sets: 3, reps: '8–12', machineId: 27, muscles: { p: ['Quadríceps'], s: ['Glúteos'] } },
      { id: 'a2', name: 'Leg Press 45°', sets: 3, reps: '10–12', machineId: 19, muscles: { p: ['Quadríceps'], s: ['Glúteos', 'Adutores'] } },
      { id: 'a3', name: 'Cadeira extensora', sets: 3, reps: '10–15', machineId: 52, muscles: { p: ['Quadríceps'], s: [] } },
      { id: 'a4', name: 'Cadeira flexora', sets: 3, reps: '10–12', machineId: 53, muscles: { p: ['Posteriores'], s: [] } },
      { id: 'a5', name: 'Cadeira abdutora', sets: 3, reps: '12–15', machineId: 50, muscles: { p: ['Glúteos'], s: [] } },
      { id: 'a6', name: 'Cadeira adutora', sets: 3, reps: '12–15', machineId: 50, muscles: { p: ['Adutores'], s: [] } },
      { id: 'a7', name: 'Panturrilha máquina', sets: 3, reps: '12–15', machineId: 12, muscles: { p: ['Panturrilha'], s: [] } },
    ],
  },
  {
    id: 'B',
    name: 'Treino B',
    subtitle: 'Costas e bíceps',
    exercises: [
      { id: 'b1', name: 'Puxada alta pegada aberta', sets: 3, reps: '8–12', machineId: 87, muscles: { p: ['Costas'], s: ['Bíceps'] } },
      { id: 'b2', name: 'Remada baixa triângulo', sets: 3, reps: '8–12', machineId: 88, muscles: { p: ['Costas'], s: ['Bíceps'] } },
      {
        id: 'b3', name: 'Remada máquina articulada', sets: 3, reps: '10–12', machineId: 6, muscles: { p: ['Costas'], s: ['Bíceps', 'Ombros'] },
        alts: [
          { id: 'b3-101', name: 'Remada guiada', machineId: 101 },
          { id: 'b3-47', name: 'Remada pendular', machineId: 47 },
          { id: 'b3-108', name: 'Remada deitada (peito apoiado)', machineId: 108 },
          { id: 'b3-57', name: 'Remada máquina (polia)', machineId: 57 },
          { id: 'b3-33', name: 'Remada cavalo com apoio', machineId: 33 },
        ],
      },
      {
        id: 'b4', name: 'Face Pull na polia', sets: 3, reps: '12–15', machineId: 89, muscles: { p: ['Ombros'], s: ['Costas'] },
        alts: [
          { id: 'b4-55', name: 'Crucifixo inverso no voador', machineId: 55 },
          { id: 'b4-66', name: 'Crucifixo inverso no multi voador', machineId: 66 },
          { id: 'b4-62', name: 'Face Pull no crossover angular', machineId: 62 },
        ],
      },
      { id: 'b5', name: 'Rosca direta com halteres', sets: 3, reps: '10–12', machineId: null, muscles: { p: ['Bíceps'], s: [] } },
      { id: 'b6', name: 'Rosca martelo', sets: 3, reps: '10–12', machineId: null, muscles: { p: ['Bíceps'], s: [] } },
    ],
  },
  {
    id: 'C',
    name: 'Treino C',
    subtitle: 'Peito, ombro e tríceps',
    exercises: [
      { id: 'c8', name: 'Supino reto com barra', sets: 3, reps: '8–12', machineId: 21, muscles: { p: ['Peito'], s: ['Tríceps', 'Ombros'] } },
      { id: 'c2', name: 'Supino inclinado máquina', sets: 3, reps: '8–12', machineId: 2, muscles: { p: ['Peito'], s: ['Ombros', 'Tríceps'] } },
      { id: 'c3', name: 'Crucifixo máquina (Peck Deck)', sets: 2, reps: '10–15', machineId: 55, muscles: { p: ['Peito'], s: [] } },
      { id: 'c9', name: 'Desenvolvimento de ombros articulado', sets: 2, reps: '8–12', machineId: 5, muscles: { p: ['Ombros'], s: ['Tríceps'] } },
      { id: 'c4', name: 'Elevação lateral máquina', sets: 3, reps: '12–15', machineId: 26, muscles: { p: ['Ombros'], s: [] } },
      { id: 'c6', name: 'Tríceps corda na polia', sets: 3, reps: '10–12', machineId: 89, muscles: { p: ['Tríceps'], s: [] } },
      { id: 'c7', name: 'Tríceps francês na polia', sets: 2, reps: '10–12', machineId: 89, muscles: { p: ['Tríceps'], s: [] } },
    ],
  },
];
