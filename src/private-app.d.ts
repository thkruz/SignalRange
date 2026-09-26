/**
 * Ambient fallback declaration for the optional `src/private` submodule.
 *
 * OSS contributors do not have the private submodule, so the `@private/*`
 * alias (tsconfig paths -> src/private/app/*) resolves to nothing for them.
 * The engine still contains guarded dynamic imports of the form
 *     __IS_PRIVATE__ ? import('@private/index') : undefined
 * which tsc resolves eagerly regardless of the flag. This wildcard supplies
 * an any-shaped module so the OSS typecheck passes; when the submodule IS
 * present, the concrete .ts files under the alias win over this ambient
 * wildcard by module-resolution precedence and private typings are enforced.
 *
 * `export =` an `any` (not `export default`) so that named access such as
 * `(await import('@private/index')).registerPrivateRoutes(...)` typechecks
 * in both editions. Do NOT delete this file.
 */
declare module '@private/*' {
  const value: any;

  export = value;
}
