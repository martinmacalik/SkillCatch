/*
 * Shapes of the static institution lists in src/data.
 * Shared by the build scripts (scripts/schools) and the app.
 */

/** One row of src/data/schools/{countryCode}.json */
export interface SchoolRecord {
  /** Country-specific registry id (CZ: RED_IZO of the legal entity). */
  id: string
  name: string
  city: string
  /** Short type label(s), e.g. "ZŠ, MŠ". */
  type: string
  countryCode: string
}

/** One row of src/data/universities.json */
export interface UniversityRecord {
  /** Stable slug "<cc>-<name>", the source list has no ids. */
  id: string
  name: string
  countryCode: string
  /** E-mail / web domains, e.g. ["cuni.cz"]. Used for school e-mail checks. */
  domains: string[]
}
