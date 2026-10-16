/**
 * Local-course-project replacement for @supabase/supabase-js.
 *
 * It exposes the small part of the Supabase client API that FitStack uses (from(), rpc(), auth.*)
 * and sends every call to the local Express + MySQL API in /api instead of Supabase. The services
 * and pages are unchanged: they still call `supabase.from('routines').select('*').eq(...)`.
 */
const API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000'

// Kept because authService posts to `${supabaseUrl}/functions/v1/send-auth-email` (a no-op locally).
export const supabaseUrl = API
export const supabaseAnonKey = 'local'

const TOKEN_KEY = 'fitstack_local_token'

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // best-effort
  }
}

type Json = Record<string, unknown>
interface Result {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  error: { message: string; code?: string; status?: number } | null
  count?: number | null
}

async function post(path: string, body: unknown): Promise<Result> {
  try {
    const token = getToken()
    const r = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body ?? {}),
    })
    const json = (await r.json()) as Result
    return { data: json.data ?? null, error: json.error ?? null, count: json.count ?? null }
  } catch {
    return { data: null, error: { message: 'Could not reach the local API (is it running on port 4000?)', status: 503 }, count: null }
  }
}

// ---------------------------------------------------------------- query builder
class Query implements PromiseLike<Result> {
  private spec: Json & { filters: Json[]; order: Json[] }

  constructor(table: string) {
    this.spec = { table, op: 'select', columns: '*', filters: [], order: [], limit: null, single: null, count: null, head: false, returning: false }
  }

  select(columns = '*', opts?: { count?: string; head?: boolean }) {
    if (this.spec.op === 'select') {
      this.spec.columns = columns
      if (opts?.count) this.spec.count = opts.count
      if (opts?.head) this.spec.head = true
    } else {
      this.spec.returning = true
      this.spec.columns = columns
    }
    return this
  }
  insert(values: unknown) { this.spec.op = 'insert'; this.spec.values = values; return this }
  upsert(values: unknown, opts?: { onConflict?: string }) { this.spec.op = 'upsert'; this.spec.values = values; this.spec.onConflict = opts?.onConflict; return this }
  update(values: unknown, opts?: { count?: string }) { this.spec.op = 'update'; this.spec.values = values; if (opts?.count) this.spec.count = opts.count; return this }
  delete(opts?: { count?: string }) { this.spec.op = 'delete'; if (opts?.count) this.spec.count = opts.count; return this }

  private f(t: string, c: string, v: unknown, extra: Json = {}) { this.spec.filters.push({ t, c, v, ...extra }); return this }
  eq(c: string, v: unknown) { return this.f('eq', c, v) }
  neq(c: string, v: unknown) { return this.f('neq', c, v) }
  gt(c: string, v: unknown) { return this.f('gt', c, v) }
  gte(c: string, v: unknown) { return this.f('gte', c, v) }
  lt(c: string, v: unknown) { return this.f('lt', c, v) }
  lte(c: string, v: unknown) { return this.f('lte', c, v) }
  like(c: string, v: string) { return this.f('like', c, v) }
  ilike(c: string, v: string) { return this.f('ilike', c, v) }
  in(c: string, v: unknown[]) { return this.f('in', c, v) }
  is(c: string, v: unknown) { return this.f('is', c, v) }
  not(c: string, op: string, v: unknown) { return this.f('not', c, v, { op }) }
  or(expr: string) { this.spec.filters.push({ t: 'or', expr }); return this }

  order(c: string, opts?: { ascending?: boolean }) { this.spec.order.push({ c, asc: opts?.ascending !== false }); return this }
  limit(n: number) { this.spec.limit = n; return this }
  single() { this.spec.single = 'single'; return this }
  maybeSingle() { this.spec.single = 'maybe'; return this }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return post('/rest/query', this.spec).then(onfulfilled, onrejected)
  }
}

// ---------------------------------------------------------------- auth
type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT'
const listeners = new Set<(event: AuthEvent, session: unknown) => void>()
function emit(event: AuthEvent, session: unknown) {
  listeners.forEach((cb) => cb(event, session))
}

interface Session {
  user: { id: string; email: string }
  access_token: string
}

function authError(error: Result['error']) {
  return error ? { message: error.message, status: error.status ?? 400 } : null
}

async function openSession(path: string, body: Json) {
  const res = await post(path, body)
  if (res.error || !res.data) return { data: { user: null, session: null }, error: authError(res.error) }
  const session = res.data as Session
  setToken(session.access_token)
  emit('SIGNED_IN', session)
  return { data: { user: session.user, session }, error: null }
}

const auth = {
  signUp: ({ email, password }: { email: string; password: string }) => openSession('/auth/signup', { email, password }),
  signInWithPassword: ({ email, password }: { email: string; password: string }) =>
    openSession('/auth/password', { email, password }),
  async signInWithOtp({ email }: { email: string; options?: unknown }) {
    const res = await post('/auth/otp/send', { email })
    return { data: {}, error: authError(res.error) }
  },
  verifyOtp: ({ email, token }: { email: string; token: string; type?: string }) =>
    openSession('/auth/otp/verify', { email, token }),
  async getUser() {
    if (!getToken()) return { data: { user: null }, error: { message: 'Auth session missing!', status: 401 } }
    const r = await fetch(API + '/auth/user', { headers: { Authorization: `Bearer ${getToken()}` } }).catch(() => null)
    const json = r ? ((await r.json()) as Result) : null
    const user = (json?.data as { user: Session['user'] } | null)?.user ?? null
    if (!user) return { data: { user: null }, error: { message: 'Auth session missing!', status: 401 } }
    return { data: { user }, error: null }
  },
  async getSession() {
    const { data } = await auth.getUser()
    const token = getToken()
    return { data: { session: data.user && token ? { user: data.user, access_token: token } : null }, error: null }
  },
  async signOut() {
    const had = getToken()
    setToken(null)
    if (had) emit('SIGNED_OUT', null)
    return { error: null }
  },
  onAuthStateChange(cb: (event: AuthEvent, session: unknown) => void) {
    listeners.add(cb)
    return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }
  },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: any = {
  from: (table: string) => new Query(table),
  rpc: (name: string, args?: Json) => post(`/rpc/${name}`, args ?? {}),
  auth,
}

/** The current signed-in user's id, for rows that need it explicitly on insert. */
export async function currentUserId(): Promise<string> {
  const { data, error } = await auth.getUser()
  if (error || !data.user) throw new Error('Not signed in.')
  return data.user.id
}
