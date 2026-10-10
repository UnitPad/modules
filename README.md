# @unitpad/modules

The numbers that [UnitPad](https://unitpad.app) sheets import with `use`: latencies, throughputs, sizes, prices and limits for
system design, each with its source. They are plain [Numbat](https://numbat.dev) modules, so they work in UnitPad and in the Numbat
command line.

```numbat
use latency::hardware
use throughput::s3

latency_main_memory / latency_l1_cache
throughput_s3_get_requests_per_prefix * 4
```

## In UnitPad

Open the Modules menu, or type `use` in a sheet. The module's card shows its source and the month its numbers were last checked.

## In the Numbat command line

```bash
npm install @unitpad/modules
export NUMBAT_MODULES_PATH="$PWD/node_modules/@unitpad/modules/modules"
```

Not run yet. To have the shared count units (`request`, `message`, `IOPS`) in every session, put `use units::systems` in your `init.nbt`.

## Licence

MIT. See [`LICENSE`](LICENSE).

## Contribute

Fix an outdated number, add a module, or replace a dead source. [`CONTRIBUTING.md`](CONTRIBUTING.md) says how, and
[`docs/style.md`](docs/style.md) says how a module is written.
