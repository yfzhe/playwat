import * as monaco from "monaco-editor";
import {
  MonacoToProtocolConverter,
  ProtocolToMonacoConverter,
} from "@codingame/monaco-languageclient";
import init, { LanguageService } from "@wasm-language-tools/wasm";

export type LanguageServerWrapper = monaco.IDisposable & {
  commit(uri: string, content: string): void;
  pullDiagnostics(model: monaco.editor.ITextModel): any;
};

const LANGSERVER_WASM_URL = new URL(
  "@wasm-language-tools/wasm/binding_wasm_bg.wasm",
  import.meta.url,
);

async function startLanguageServer(): Promise<LanguageServerWrapper> {
  await init(LANGSERVER_WASM_URL);
  const languageService = new LanguageService();

  monaco.languages.register({ id: "wat", extensions: [".wat"] });
  monaco.languages.setMonarchTokensProvider("wat", {
    brackets: [{ open: "(", close: ")", token: "delimiter.parenthesis" }],
    keywords: [
      "module",
      "func",
      "type",
      "param",
      "result",
      "local",
      "end",
      "if",
      "then",
      "else",
      "block",
      "loop",
      "data",
      "elem",
      "declare",
      "export",
      "global",
      "memory",
      "import",
      "start",
      "table",
      "item",
      "offset",
      "mut",
    ],
    typeKeywords: ["i32", "i64", "f32", "f64", "v128", "funcref", "externref"],
    tokenizer: {
      root: [
        [
          /[a-z_$][\w.$]*/,
          {
            cases: {
              "@typeKeywords": "type.identifier",
              "@keywords": "keyword",
              "@default": "operators",
            },
          },
        ],
        [/$[\w.$-_]+/, "variable.name"],
        { include: "@whitespace" },
        [/[()]/, "@brackets"],
        [/\d*\.\d+([eE][\-+]?\d+)?/, "number.float"],
        [/0[xX][0-9a-fA-F]+/, "number.hex"],
        [/\d+/, "number"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, { token: "string.quote", bracket: "@open", next: "@string" }],
      ],
      comment: [
        [/[^;)]+/, "comment"],
        [/;\)/, "comment", "@pop"],
        [/[;)]/, "comment"],
      ],
      string: [
        [/[^\\"]+/, "string"],
        [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
      ],
      whitespace: [
        [/[ \t\r\n]+/, "white"],
        [/\(;/, "comment", "@comment"],
        [/;;.*$/, "comment"],
      ],
    },
  });

  const m2p = new MonacoToProtocolConverter(monaco);
  const p2m = new ProtocolToMonacoConverter(monaco);

  const createModelListener = monaco.editor.onDidCreateModel(async (model) => {
    if (model.getLanguageId() === "wat") {
      const languageServer = await languageServerPromise;
      languageServer.commit(model.uri.toString(), model.getValue());
      updateDiagnosticMarkers(languageServer, model);

      model.onDidChangeContent(() => {
        languageServer.commit(model.uri.toString(), model.getValue());
        updateDiagnosticMarkers(languageServer, model);
      });
    }
  });
  function updateDiagnosticMarkers(
    languageServer: LanguageServerWrapper,
    model: monaco.editor.ITextModel,
  ) {
    const diagnostics = languageServer.pullDiagnostics(model);
    monaco.editor.setModelMarkers(
      model,
      "wat",
      p2m.asDiagnostics(diagnostics.items) ?? [],
    );
  }
  const completionProvider = monaco.languages.registerCompletionItemProvider(
    "wat",
    {
      triggerCharacters: ["$", "("],
      provideCompletionItems(model, position, context) {
        return p2m.asCompletionResult(
          languageService.completion(
            m2p.asCompletionParams(model, position, context),
          ),
          undefined,
        );
      },
    },
  );
  const declarationProvider = monaco.languages.registerDeclarationProvider(
    "wat",
    {
      provideDeclaration(model, position) {
        return p2m.asDefinitionResult(
          languageService.gotoDeclaration(
            m2p.asTextDocumentPositionParams(model, position),
          ),
        );
      },
    },
  );
  const definitionProvider = monaco.languages.registerDefinitionProvider(
    "wat",
    {
      provideDefinition(model, position) {
        return p2m.asDefinitionResult(
          languageService.gotoDefinition(
            m2p.asTextDocumentPositionParams(model, position),
          ),
        );
      },
    },
  );
  const documentHightlightProvider =
    monaco.languages.registerDocumentHighlightProvider("wat", {
      provideDocumentHighlights(model, position) {
        return p2m.asDocumentHighlights(
          languageService.documentHighlight(
            m2p.asTextDocumentPositionParams(model, position),
          ),
        );
      },
    });
  const documentSymbolProvider =
    monaco.languages.registerDocumentSymbolProvider("wat", {
      provideDocumentSymbols(model) {
        const docSymbol = languageService.documentSymbol(
          m2p.asDocumentSymbolParams(model),
        );
        if (!docSymbol) {
          return null;
        } else {
          return p2m.asDocumentSymbols(docSymbol);
        }
      },
    });
  const foldingRangeProvider = monaco.languages.registerFoldingRangeProvider(
    "wat",
    {
      provideFoldingRanges(model) {
        const foldingRange = languageService.foldingRange({
          textDocument: m2p.asTextDocumentIdentifier(model),
        });
        if (!foldingRange) {
          return null;
        } else {
          return p2m.asFoldingRanges(foldingRange);
        }
      },
    },
  );
  const formattingProvider =
    monaco.languages.registerDocumentFormattingEditProvider("wat", {
      provideDocumentFormattingEdits(model, options) {
        return p2m.asTextEdits(
          languageService.formatting(
            m2p.asDocumentFormattingParams(model, options),
          ),
        );
      },
    });
  const hoverProvider = monaco.languages.registerHoverProvider("wat", {
    provideHover(model, position) {
      return p2m.asHover(
        languageService.hover(
          m2p.asTextDocumentPositionParams(model, position),
        ),
      );
    },
  });
  const rangeFormattingProvider =
    monaco.languages.registerDocumentRangeFormattingEditProvider("wat", {
      provideDocumentRangeFormattingEdits(model, range, options) {
        return p2m.asTextEdits(
          languageService.rangeFormatting(
            m2p.asDocumentRangeFormattingParams(model, range, options),
          ),
        );
      },
    });
  const referenceProvider = monaco.languages.registerReferenceProvider("wat", {
    provideReferences(model, position, context) {
      return p2m.asReferences(
        languageService.findReferences(
          m2p.asReferenceParams(model, position, context),
        ),
      );
    },
  });
  const renameProvider = monaco.languages.registerRenameProvider("wat", {
    provideRenameEdits(model, position, newName) {
      const result = languageService.rename(
        m2p.asRenameParams(model, position, newName),
      );
      if (!result) {
        return { edits: [] };
      } else {
        const { edits }: monaco.languages.WorkspaceEdit =
          p2m.asWorkspaceEdit(result);
        edits.forEach((edit) => {
          // @ts-expect-error
          edit.versionId = model.getVersionId();
          // @ts-expect-error
          edit.textEdit = edit.edit;
        });
        return { edits };
      }
    },
    resolveRenameLocation(model, position) {
      const prepareRename = languageService.prepareRename(
        m2p.asTextDocumentPositionParams(model, position),
      );
      if (!prepareRename) {
        return {
          range: new monaco.Range(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column,
          ),
          text: "",
          rejectReason: "This element can't be renamed.",
        };
      } else if ("defaultBehavior" in prepareRename) {
        return undefined;
      } else if ("placeholder" in prepareRename) {
        const range = p2m.asRange(prepareRename.range);
        return {
          range,
          text: prepareRename.placeholder,
        };
      } else {
        const range = p2m.asRange(prepareRename);
        return {
          range: prepareRename,
          text: model.getValueInRange(range),
        };
      }
    },
  });
  const signatureHelpProvider = monaco.languages.registerSignatureHelpProvider(
    "wat",
    {
      signatureHelpTriggerCharacters: ["(", ")"],
      provideSignatureHelp(model, position) {
        return p2m.asSignatureHelpResult(
          languageService.signatureHelp(
            m2p.asTextDocumentPositionParams(model, position),
          ),
        );
      },
    },
  );
  const typeDefinitionProvider =
    monaco.languages.registerTypeDefinitionProvider("wat", {
      provideTypeDefinition(model, position) {
        return p2m.asDefinitionResult(
          languageService.gotoTypeDefinition(
            m2p.asTextDocumentPositionParams(model, position),
          ),
        );
      },
    });

  return {
    commit(uri, content) {
      languageService.commit(uri, content);
    },
    pullDiagnostics(model) {
      return languageService.pullDiagnostics({
        textDocument: m2p.asTextDocumentIdentifier(model),
      });
    },
    dispose() {
      createModelListener.dispose();
      completionProvider.dispose();
      documentHightlightProvider.dispose();
      declarationProvider.dispose();
      definitionProvider.dispose();
      documentSymbolProvider.dispose();
      foldingRangeProvider.dispose();
      formattingProvider.dispose();
      hoverProvider.dispose();
      rangeFormattingProvider.dispose();
      referenceProvider.dispose();
      renameProvider.dispose();
      signatureHelpProvider.dispose();
      typeDefinitionProvider.dispose();
      languageService.free();
    },
  };
}

const languageServerPromise = startLanguageServer();
export default languageServerPromise;
