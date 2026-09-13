export type Hole = { hole: number; par: number; hcp: number; yards: number }
export type Course = { name: string; holes: Hole[] }

export const COURSE: Course = {
  name: "Stonebrae — Black Tees",
  holes: [
    { hole: 1, par: 4, hcp: 9, yards: 370 },
    { hole: 2, par: 4, hcp: 11, yards: 385 },
    { hole: 3, par: 3, hcp: 15, yards: 176 },
    { hole: 4, par: 5, hcp: 7, yards: 462 },
    { hole: 5, par: 4, hcp: 13, yards: 301 },
    { hole: 6, par: 5, hcp: 1, yards: 576 },
    { hole: 7, par: 3, hcp: 17, yards: 159 },
    { hole: 8, par: 4, hcp: 3, yards: 433 },
    { hole: 9, par: 4, hcp: 5, yards: 407 },
    { hole: 10, par: 4, hcp: 8, yards: 397 },
    { hole: 11, par: 3, hcp: 12, yards: 204 },
    { hole: 12, par: 5, hcp: 4, yards: 571 },
    { hole: 13, par: 3, hcp: 18, yards: 138 },
    { hole: 14, par: 4, hcp: 10, yards: 321 },
    { hole: 15, par: 3, hcp: 16, yards: 156 },
    { hole: 16, par: 5, hcp: 14, yards: 469 },
    { hole: 17, par: 4, hcp: 2, yards: 436 },
    { hole: 18, par: 5, hcp: 6, yards: 554 },
  ],
}

export const FRONT_PAR = COURSE.holes.slice(0, 9).reduce((s, h) => s + h.par, 0)
export const BACK_PAR = COURSE.holes.slice(9, 18).reduce((s, h) => s + h.par, 0)
export const TOTAL_PAR = FRONT_PAR + BACK_PAR
