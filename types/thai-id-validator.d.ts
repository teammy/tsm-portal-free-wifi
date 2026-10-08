// Package ships index.d.ts but its "exports" field hides it from TS resolution.
declare module 'thai-id-validator' {
  export default function isValidThaiID(input: string | number): boolean
}
