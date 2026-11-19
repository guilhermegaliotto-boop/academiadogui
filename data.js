// Treinos padrão. machineId = número da máquina no catálogo Cimerian (catalog.js).
// null = exercício sem máquina (halteres / livre).
export const DEFAULT_WORKOUTS = [
  {
    id: 'A',
    name: 'Treino A',
    subtitle: 'Pernas',
    exercises: [
      { id: 'a1', name: 'Agachamento Hack', sets: 3, reps: '8–12', machineId: 27 },
      { id: 'a2', name: 'Leg Press 45°', sets: 3, reps: '10–12', machineId: 19 },
      { id: 'a3', name: 'Cadeira extensora', sets: 3, reps: '10–15', machineId: 52 },
      { id: 'a4', name: 'Cadeira flexora', sets: 3, reps: '10–12', machineId: 53 },
      { id: 'a5', name: 'Cadeira abdutora', sets: 3, reps: '12–15', machineId: 50 },
      { id: 'a6', name: 'Cadeira adutora', sets: 3, reps: '12–15', machineId: 50 },
      { id: 'a7', name: 'Panturrilha máquina', sets: 3, reps: '12–15', machineId: 12 },
    ],
  },
  {
    id: 'B',
    name: 'Treino B',
    subtitle: 'Costas e bíceps',
    exercises: [
      { id: 'b1', name: 'Puxada alta pegada aberta', sets: 3, reps: '8–12', machineId: 87 },
      { id: 'b2', name: 'Remada baixa triângulo', sets: 3, reps: '8–12', machineId: 88 },
      { id: 'b3', name: 'Remada máquina articulada', sets: 3, reps: '10–12', machineId: 6 },
      { id: 'b4', name: 'Face Pull na polia', sets: 3, reps: '12–15', machineId: 89 },
      { id: 'b5', name: 'Rosca direta com halteres', sets: 3, reps: '10–12', machineId: null },
      { id: 'b6', name: 'Rosca martelo', sets: 3, reps: '10–12', machineId: null },
    ],
  },
  {
    id: 'C',
    name: 'Treino C',
    subtitle: 'Peito, ombro e tríceps',
    exercises: [
      { id: 'c1', name: 'Supino máquina', sets: 3, reps: '8–12', machineId: 58 },
      { id: 'c2', name: 'Supino inclinado máquina', sets: 3, reps: '8–12', machineId: 2 },
      { id: 'c3', name: 'Crucifixo máquina (Peck Deck)', sets: 2, reps: '10–15', machineId: 55 },
      { id: 'c4', name: 'Elevação lateral máquina', sets: 3, reps: '12–15', machineId: 26 },
      { id: 'c5', name: 'Desenvolvimento de ombros máquina', sets: 2, reps: '8–12', machineId: 64 },
      { id: 'c6', name: 'Tríceps corda na polia', sets: 3, reps: '10–12', machineId: 89 },
      { id: 'c7', name: 'Tríceps francês na polia', sets: 2, reps: '10–12', machineId: 89 },
    ],
  },
];
