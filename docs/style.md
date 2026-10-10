# Module style

The rules for every `.nbt` file in `modules/`. A reviewer holds a pull request to them. [`CONTRIBUTING.md`](../CONTRIBUTING.md) says which of them a
tool checks today.

## Files and names

- A file `modules/a/b.nbt` is the module `a::b`. A sheet imports it with `use a::b`. Folders nest to any depth.
- Every `let` and `fn` starts with the module path joined by `_`.

  | File | Module | Prefix |
  |---|---|---|
  | `latency.nbt` | `latency` | `latency_` |
  | `throughput/storage.nbt` | `throughput::storage` | `throughput_storage_` |
  | `latency/llm.nbt` | `latency::llm` | `latency_llm_` |

  Why: a sheet can import many modules, and the prefix keeps their names apart.
- Names are `snake_case`, never camelCase.
- A file name is lower case with dashes (`rate-limits.nbt`).

## The header

Each module starts with comments that describe it:

```numbat
# Import with:  use throughput::storage    then use the throughput_storage_* values
# title: Throughput (Storage)
# description: One-line summary
# source: https://example.com/reference
# checked: 2026-10
# vendor: aws, redis
```

| Line | Rule |
|---|---|
| `# Import with:` | Required. Keep this wording. Add "values and functions" at the end when the module defines a `fn`. |
| `# title:` | Required. The label in the Modules menu. |
| `# description:` | Required. One line, shown in the menu and on the module's card. |
| `# source:` | Optional. A link on the module's card. |
| `# checked:` | Required. The month someone last compared the numbers with their sources (`2026-10`), or `unverified`. |
| `# vendor:` | Optional. A comma list that the Modules filter box matches. |

Raise `# checked:` only for what you compared. A module with one fixed value is not checked as a whole.

A build never fails because a month is old. `tools/stale.mjs` lists the modules that are due, and `tools/links.mjs` lists the
sources that no longer answer. A schedule runs both. A pull request never does.

A module does not declare whether it depends on the clock. UnitPad finds the lines that read `now()` or `today()` and updates them.

## Values and functions

### Every definition

- Put `@description("…")` on every `let` and `fn`.
- Put `@url("…")` on every value that has a source. The link is the source of truth for the figure.
- A rule of thumb with no primary source may omit `@url`. Its description then says so.
- Say when a number is not documented: `estimate`, `~`, `rule of thumb`, `legacy whitepaper`.

### Functions

- Give every public `fn` typed parameters and a typed return. Use `Scalar` for a dimensionless input. Use a named dimension
  such as `Time` or `Length` where one fits. Use `<D: Dim>` when the function keeps any dimension.

  ```numbat
  fn capacity_concurrency<R: Dim>(rate: R / Time, w: Time) -> R = rate * w
  ```

  Why: the types show the function's dimensions, and Numbat checks them at every call.
- Add at least one `@example("…")` to every public `fn`. Use values with units. Keep each example inside the limits that the
  description states, such as `0 ≤ rho < 1`.
- Numbat has no default arguments and no overloading. A variant needs its own name: `capacity_nodes` and
  `capacity_nodes_with_utilization(load, per_node, utilization)`.

### Usage lines and highlights

- `# usage: expression` in the header is a one-line check. A tool evaluates it after importing the module. Show how the values
  combine with quantities (`cost_s3_storage * 10 TB * 1 year -> USD`). It does not change the module.
- `# highlight: Short label` directly above a `let` puts that value in the summary row that UnitPad shows for `use`. It applies to a
  `let` only. A `fn` after it clears the label.

### Descriptions

A card shows the description next to the definition, so the two must agree.

- Name a value by its real identifier. Every identifier in the text must exist: a name in the module, a parameter, or a constant
  from another module. Do not invent a short form. A `target` in the text when the name is `capacity_target_utilization` is a bug.
- Keep the formula and the units in the text equal to the body.
- Point `@url` at the model the code uses. Sizing over `c` servers is the utilization law (`M/M/c`), not `M/M/1`.
- When a body uses another value, name that value in the description. `throughput_storage_nvme_rand_read` names
  `throughput_storage_nvme_rand_read_iops`, so a reader sees where each factor comes from.
- Paraphrase the source. Do not paste its text.

### Counts and rates

- A count of something that a shared unit covers carries that unit, so it compares with what the functions return:
  `count_lambda_concurrency = 1_000 request`. A count nothing else measures (connections, partitions, parts) stays a plain
  number. So does a true ratio (an SLA, a compression ratio).
- Name a count rate by what it counts, then add a qualifier: `_requests`, `_ops`, `_msgs`, `_records`, `_rows`, `_iops`, `_wcu`,
  `_rcu`. Examples: `throughput_s3_get_requests_per_prefix`, `throughput_db_sql_read_ops_high`. Never use `_qps`, `_rps` or
  `_tps`. They do not say what is counted.
- Price per request, operation or capacity unit with that unit in the denominator, so that a typed count times the price gives money.
  Give billable quantities that do not mix their own units. DynamoDB read and write request units are one example.

## Units

Every unit lives in a shared module (see below). A module you import with `use` defines none.

Why: a unit in a shared module is in every sheet and every module. A unit in an imported module is available only after the `use`,
and two modules that define the same unit clash.

- The canonical name is singular. The plural and the short forms are aliases.

  ```numbat
  @aliases(ops, operations) unit operation
  @aliases(req, requests) unit request
  ```

- Do not redefine a shared unit or one of Numbat's own.
- A new count unit has its own dimension, as the shared ones do.

  ```numbat
  dimension Vcpu

  @name("vCPU")
  @aliases(vcpus)
  unit vcpu: Vcpu
  ```

- Write disk and volume rates in `IOPS` (`3_000 IOPS`). Write the size of one I/O as `4 KiB/io`. A disk I/O is its own count,
  `io`, not an `operation`.
- Do not define a named rate as exactly `<count>/s` for a count that has other uses. Numbat prints a value in the one unit that is
  defined as exactly its unit, so `unit X = operation / second` would print every `operation/s` value as `X`. This is why `IOPS` is
  `io/s` over its own `io` count.
- Do not add `@metric_prefixes` to a count unit (`request`, `operation`). Write scale in words: `5 million request/s`. Why: prefixes allow
  `5 mops` (0.005) and `5 Mops` (5 million), a typo that is a factor of 10⁹. They also fill autocomplete with names such as `creq`
  and `µreq`.
- Add prefixes only where the unit is written with one in practice: `kIOPS`, `TFLOP/s`, `MB`, `Gbps`.

## Modules do not import modules

A module cannot `use` another module. UnitPad resolves each `use` that a sheet writes, so a `use` inside a module never receives its
dependency. Repeat the constant you need and name it in the description. `latency::hardware` does this for the memory bandwidth that
it takes from `throughput`.

## What every sheet starts with

The manifest `unitpad.json` names the modules that every sheet starts with (its field `prelude`). Today it names `units::systems`, a
module made only of `use` lines. UnitPad expands such a module into the modules it lists, in order, once each, before the sheet. A
module may rely on one that is listed above it. A prelude module is not importable and is not in the Modules menu.

The package has no file called `prelude.nbt`. The Numbat command line takes that file in a module folder as a replacement for its whole
prelude. To get the same units in the command line, add `use units::systems` to your `init.nbt`.

`units::systems` lists Numbat's own `units::currencies` first. The currencies, including `USD`, are Numbat's. This package defines
none and never declares its own `USD`.

The shared units are the `systems` domain, split by kind:

| Module | Units |
|---|---|
| `units::systems::workload` | event, operation, request, message, row, record |
| `units::systems::storage` | io, IOPS |
| `units::systems::network` | packet |
| `units::systems::compute` | FLOP, vCPU |
| `units::systems::aws` | DynamoDB read and write request units |

A new unit goes in the module of its kind. A new kind is a new file under `modules/units/systems/` and a `use` line in
`modules/units/systems.nbt`.

Rules for the shared units:

- Each count unit is its own dimension, so `message/s` and `record/s` do not mix. Convert with an explicit ratio:
  `records_per_message = 10 record/message`.
- Declare each one as Numbat declares `units::placeholder`: `dimension Request`, then `@name` and `@aliases`, then
  `unit request: Request`. Generic `<D: Dim>` functions are better than the dimension names in signatures.
- Write rates as `<unit>/s` (`50_000 operation/s`). The one named rate is `IOPS`, with metric prefixes (`500 kIOPS`). Do not add
  short forms such as `rps`. They mean different things in different tools, and they can clash with Numbat's units (`rpm` is
  revolutions per minute).
- Write compute as `FLOP/s`. There is no `flops` alias, because FLOPS often means FLOP per second.
- DynamoDB read and write request units (`dynamodb_rru`, `dynamodb_wru`) are shared. `cost` prices them and `throughput::db` caps
  them per second.

## Which check holds which rule

| Rule | Held by |
|---|---|
| A file name is kebab-case. A module defines a value or a function | `tools/style.mjs` |
| The header: the `# Import with:` line, `# title:`, `# description:`, `# checked:`, and `# highlight:` above a value | `tools/style.mjs` |
| A title and a description: no em dash, three dots, contraction or exclamation mark, no banned word, no `Numbat`, sentences of 20 words at most | `tools/style.mjs` |
| Every value and function starts with the module path and has `@description` | `tools/style.mjs` |
| A public function has an `@example` and a type on every parameter and on its result | `tools/style.mjs` |
| A count unit has its own dimension and no metric prefixes (FLOP excepted). A unit lives in a module that the prelude reaches, and is defined once | `tools/style.mjs` |
| No `_qps`, `_rps` or `_tps`. A count rate carries the word for what it counts | `tools/style.mjs`, with the `numbat` program |
| Each `@example` and each `# usage:` line runs. `USD` works in every session | `tools/style.mjs`, with the `numbat` program |
| The manifest has a known format, a prelude and unique menu types, and the type of each module has an entry | `tools/style.mjs` |
| A module loads, and a value keeps its dimension, its function its signature | `tools/values.mjs`, with the `numbat` program |
| A removed or added name moves the version | `tools/api.mjs` |
| Descriptions paraphrase the source. A source supports the figure. A name is the real identifier | A reviewer |
