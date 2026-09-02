<?php

namespace App\Http\Controllers;

use App\Models\LookupList;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Adding to and removing from one of the master lists Add Product offers.
 * Articles, colours and sizes differ only in wording, so the behaviour is
 * written once and the subclasses supply the nouns.
 */
abstract class LookupController extends Controller
{
    /** @return class-string<LookupList> */
    abstract protected function model(): string;

    /** The request key holding the labels, e.g. "sizes". */
    abstract protected function field(): string;

    /** Singular noun for messages, e.g. "size". */
    abstract protected function noun(): string;

    /** The products column that would be orphaned by a removal. */
    abstract protected function usedColumn(): string;

    /** Add one or more entries to the list. */
    public function store(Request $request)
    {
        $field = $this->field();

        $data = $request->validate([
            $field         => ['required', 'array', 'min:1', 'max:60'],
            "$field.*"     => ['required', 'string', 'max:120'],
        ]);

        $labels = array_map('trim', $data[$field]);
        $labels = array_values(array_filter($labels, fn ($s) => $s !== ''));

        /* Two spellings of one value in a single submission would collide on
           the unique index, so keep the first of each. */
        $seen = [];
        foreach ($labels as $s) {
            $seen[mb_strtolower($s)] ??= $s;
        }
        $labels = array_values($seen);

        if (! $labels) {
            throw ValidationException::withMessages([
                $field => 'Add at least one ' . $this->noun() . '.',
            ]);
        }

        $model = $this->model();

        $taken = $model::whereIn(DB::raw('LOWER(label)'), array_map('mb_strtolower', $labels))
            ->pluck('label')
            ->map(fn ($s) => mb_strtolower($s))
            ->all();

        $fresh   = [];
        $skipped = [];
        foreach ($labels as $s) {
            in_array(mb_strtolower($s), $taken, true) ? $skipped[] = $s : $fresh[] = $s;
        }

        if (! $fresh) {
            throw ValidationException::withMessages([
                $field => count($skipped) === 1
                    ? ucfirst($this->noun()) . " {$skipped[0]} is already on the list."
                    : 'All ' . count($skipped) . ' of those are already on the list.',
            ]);
        }

        DB::transaction(function () use ($model, $fresh, $request) {
            $made = [];
            foreach ($fresh as $label) {
                $made[] = $model::create(['label' => $label]);
            }
            $this->afterStore($made, $request);
        });

        return response()->json([
            $field    => $this->all(),
            'added'   => $fresh,
            'skipped' => $skipped,
        ], 201);
    }

    public function destroy(int $id)
    {
        $model = $this->model();
        $row   = $model::findOrFail($id);

        /* Removing something stock was generated against would leave those
           barcodes describing a value the system no longer offers. */
        $inUse = Product::where($this->usedColumn(), $row->label)->count();

        if ($inUse > 0) {
            return response()->json([
                'message' => "Cannot remove {$row->label} — $inUse barcode(s) use it.",
            ], 422);
        }

        $row->delete();

        return response()->json([$this->field() => $this->all()]);
    }

    /**
     * Runs inside the same transaction as the inserts, for a list that carries
     * more than a label. Does nothing by default.
     *
     * @param  list<LookupList>  $made
     */
    protected function afterStore(array $made, Request $request): void
    {
    }

    /** @return list<array{id:int,label:string}> */
    protected function all(): array
    {
        $model = $this->model();

        return $model::ordered()->get()->map->toWire()->all();
    }
}
