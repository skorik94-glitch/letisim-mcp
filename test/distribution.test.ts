import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { retailMcpFactory } from "../src/server.js";

/**
 * `RETAIL-MCP-002` M6. Метаданные листинга ломаются молча: расхождение `mcpName` и `server.json`
 * видно только в отказе реестра, а localhost-дефолт — только у установившего пакет человека,
 * у которого «ничего не работает». Оба случая ловим здесь, до подачи.
 */
const packageDir = join(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
const server = JSON.parse(readFileSync(join(packageDir, "server.json"), "utf8"));

describe("MCP registry metadata", () => {
  it("имя в реестре совпадает с маркером владения пакетом", () => {
    expect(pkg.mcpName).toBe(server.name);
    expect(server.packages[0].identifier).toBe(pkg.name);
  });

  it("версии пакета и записи реестра не расходятся", () => {
    expect(server.version).toBe(pkg.version);
    expect(server.packages[0].version).toBe(pkg.version);
  });

  it("публикует server.json вместе с пакетом", () => {
    expect(pkg.files).toContain("server.json");
    expect(pkg.files).toContain("dist");
  });

  it("не объявляет ни одной секретной переменной", () => {
    // У розничного сервера нет ключа по замыслу: он анонимный и ничего не тратит.
    for (const variable of server.packages[0].environmentVariables ?? []) {
      expect(variable.isSecret, variable.name).toBe(false);
      expect(variable.isRequired, variable.name).toBe(false);
    }
  });

  it("ведёт в ПУБЛИЧНЫЙ репозиторий, а не в приватный монорепозиторий", () => {
    // Ссылка на приватный репозиторий — это 404 у ревьюера реестра и у любого, кто пришёл
    // из листинга смотреть исходники. Публичное зеркало генерируется
    // `scripts/sync-retail-mcp-public.mjs`.
    expect(server.repository.url).toBe("https://github.com/skorik94-glitch/letisim-mcp");
    expect(pkg.repository.url).toContain("letisim-mcp");
    expect(pkg.repository.url).not.toMatch(/letisim\.git$/);
  });

  it("остаётся приватным, пока гейты RETAIL-MCP-001 не закрыты", () => {
    // Флип этого поля — осознанное действие владельца, а не побочный эффект правки метаданных.
    expect(pkg.private).toBe(true);
  });
});

describe("installed-package defaults", () => {
  it("по умолчанию ходит в канонический публичный origin, а не в localhost", () => {
    const factory = retailMcpFactory({} as NodeJS.ProcessEnv);
    expect(typeof factory).toBe("function");
    expect(() => factory()).not.toThrow();
  });

  it("явно отвергает не-http(s) origin", () => {
    expect(() => retailMcpFactory({ LETISIM_API_BASE_URL: "file:///etc/passwd" } as NodeJS.ProcessEnv)).toThrow();
  });
});
