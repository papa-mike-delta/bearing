// Reads one line from a terminal without showing what's typed, like sudo.
// Raw mode is always put back, including on Ctrl-C, which rejects with an
// AbortError instead of killing the process mid-prompt.

import type { Writable } from "node:stream";

type Terminal = NodeJS.ReadableStream & {
  isRaw?: boolean;
  setRawMode(mode: boolean): unknown;
};

export function readHidden(
  prompt: string,
  { input, output }: { input: Terminal; output: Writable },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const wasRaw = input.isRaw ?? false;
    let line = "";
    const finish = (error?: Error) => {
      input.removeListener("data", onData);
      input.setRawMode(wasRaw);
      input.pause();
      output.write("\n");
      if (error) reject(error);
      else resolve(line);
    };
    const onData = (chunk: string | Buffer) => {
      for (const char of String(chunk)) {
        if (char === "\r" || char === "\n" || char === "\u0004") {
          return finish();
        }
        if (char === "\u0003") {
          return finish(
            Object.assign(new Error("Cancelled"), { name: "AbortError" }),
          );
        }
        if (char === "\u007f" || char === "\b") {
          line = [...line].slice(0, -1).join("");
        } else if (char >= " ") {
          line += char;
        }
      }
    };
    output.write(prompt);
    input.setRawMode(true);
    input.setEncoding("utf8");
    input.on("data", onData);
    input.resume();
  });
}
