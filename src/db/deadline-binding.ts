import { DatabaseBudget } from "@/lib/database-timeout";

/** Guard execution, not query construction, so later mutation steps cannot start after timeout. */
export function withD1Deadline(binding: D1Database, budget: DatabaseBudget): D1Database {
  const statements = new WeakMap<D1PreparedStatement, { original: D1PreparedStatement; write: boolean }>();

  function prepare(target: D1Database | D1DatabaseSession, sql: string): D1PreparedStatement {
    // Treat anything other than an explicit read as a possible write, without logging SQL.
    const write = !/^\s*(SELECT|EXPLAIN)\b/i.test(sql);
    const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
      const guarded = new Proxy(statement, {
        get(target, key) {
          if (key === "bind") return (...values: unknown[]) => wrap(target.bind(...values));
          const value = Reflect.get(target, key, target);
          if (typeof value !== "function") return value;
          if (["all", "first", "raw", "run"].includes(String(key))) {
            return (...args: unknown[]) => budget.run(`d1.${String(key)}`, () => value.apply(target, args), write);
          }
          return value.bind(target);
        },
      });
      statements.set(guarded, { original: statement, write });
      return guarded;
    };
    return wrap(target.prepare(sql));
  }

  function wrap<T extends D1Database | D1DatabaseSession>(target: T): T {
    return new Proxy(target, {
      get(target, key) {
        if (key === "prepare") return (sql: string) => prepare(target, sql);
        if (key === "batch") return (queries: D1PreparedStatement[]) => budget.run(
          "d1.batch",
          () => target.batch(queries.map((query) => statements.get(query)?.original ?? query)),
          queries.some((query) => statements.get(query)?.write ?? true),
        );
        if (key === "withSession" && "withSession" in target) {
          return (...args: Parameters<D1Database["withSession"]>) => wrap(target.withSession(...args));
        }
        const value = Reflect.get(target, key, target);
        if (typeof value !== "function") return value;
        if (key === "exec") return (sql: string) => budget.run("d1.exec", () => value.call(target, sql), true);
        return value.bind(target);
      },
    });
  }

  return wrap(binding);
}
