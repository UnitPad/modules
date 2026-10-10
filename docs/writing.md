# Writing in this repository

How the documents here are written: this repository's README and guides, comments in module files, and the text of issues and pull
requests. This is the only guide to them. The reader knows what a latency or a throughput is. They may not read English as a first
language, and they have time to read. Short, plain sentences serve them best.

The style is lightly adapted Simplified Technical English (ASD-STE100): the rules that make short text clear for any reader, without
its approved-word dictionary.

## The voice

1. **One word for one meaning.** Use the word from the table below every time.
2. **Short sentences.** At most 25 words, one idea each. A list or a table is better than a long sentence. A check counts the words of
   each sentence in a paragraph or in one list item. A code span counts as one word. Tables, code blocks and headings are not counted.
3. **Active voice and simple tenses.** "The tool lists the stale modules", not "The stale modules are listed".
4. **Plain words.** "Use", not "utilize". No idiom. <!-- docs-check: ignore -->
5. **No vague words.** Not "simply", "just", "easily", "please". <!-- docs-check: ignore -->
6. **Name the thing.** Repeat the noun instead of "it" when "it" could mean two things.
7. **Calm.** No exclamation marks and no apology.
8. **No em dash, no contraction.** Write "cannot" and "does not". Use a colon or a full stop where a dash would go.
9. **A semicolon only inside a list item or a table cell.** In prose, write two sentences.
10. **A colon** introduces a list, or joins a label and its value.
11. **Address the reader as "you" in steps.** In rules, name the role: "a contributor", "a maintainer".
12. **Quotes** are straight, and only around text that the reader will see on a screen.

## The words

| Say | Means | Not |
|---|---|---|
| **module** | One `.nbt` file that a sheet imports with `use` | library, package |
| **package** | The published bundle of modules, `@unitpad/modules` | module (for the bundle) |
| **sheet** | What a person writes in UnitPad | document, notebook |
| **UnitPad** | The product that a reader uses | the app, the site |
| **reader** | A person using UnitPad | user, customer |
| **contributor** | A person who sends a change here | developer |
| **maintainer** | A person who merges and releases | owner, admin |
| **value** | A `let` or a `fn` in a module | variable, constant (for a `let` that a module exports) |
| **source** | The page that a number comes from | reference, citation |
| **documentation card** | The card that UnitPad shows for a name or a module. After the first use, **card** | tooltip, popup |
| **pin** | The exact version that UnitPad depends on | lock, freeze |
| **check** | A tool that fails when a rule is broken | lint, validation |
| **release** | A published version | deploy, ship |

## How a document is built

1. **Open with what it is and who it is for**, in one or two sentences. A reader who is in the wrong file then leaves early.
2. **A heading is a noun or an imperative** (`The header`, `Change a module`). It is never a question.
3. **Steps are numbered and imperative.** One action in each. Say what the reader sees when it worked.
4. **Give the reason next to the rule**, in one sentence that starts `Why:`, when it is not obvious.
5. **Use a table to compare or look up** (files, options, bumps). Use prose for a sequence or a reason.
6. **Say what does not exist yet.** Describe only what is built. Put the rest under `Not built`, with what would finish it.
7. **Each rule has one home.** Link to it. Do not copy it.
8. **Name what enforces a rule**: a tool, a template, a reviewer.
9. **Describe how things are**, not how they were. The reason for a shape is one `Why:` sentence. The story is in the commit message.
10. **Use real examples**: a value or a command that exists here, not `foo`.

## What a document here does not carry

1. **No link to a page that a reader cannot open.** No path or command from another repository.
2. **Only what a contributor can run.** A check that a maintainer runs is not listed as a contributor's. The document says who runs it.
3. **File names.** `README.md`, `CONTRIBUTING.md`, `LICENSE` and `SECURITY.md` are upper case at the root, because GitHub finds them there.
   Every other guide is kebab-case in `docs/`.

## Code in a document

- A fenced block has a language: `bash`, `numbat`, `json` or `text`.
- A command that a reader runs works when pasted.
- A file, a command, a field and a name from a module are in code font.
- Run a command before it goes in a document. If you cannot, the line after it says `Not run yet.`

## Changing a document

1. Check the table of words. Add a row before you add a new word.
2. Change the document in the same commit as the change it describes. A document that disagrees with the files is a bug.
3. Run `node tools/check-docs.mjs`. It fails on an em dash, a contraction, a vague word, a long sentence, a semicolon in prose, a
   heading that is a question, and a few words in the table above. A line that quotes a banned word, as this guide does, ends with
   `<!-- docs-check: ignore -->`.
4. Run `npm run lint:md`. It keeps Markdown clean: blank lines around headings and lists, and a language on every fenced block.

## Not built

- The rest of the table of words. The check knows three banned words (`user`, `library` and `deploy`), because most other rows need the
  sentence around the word to judge.
