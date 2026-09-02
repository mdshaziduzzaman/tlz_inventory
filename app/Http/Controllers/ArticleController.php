<?php

namespace App\Http\Controllers;

use App\Models\Article;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ArticleController extends LookupController
{
    protected function model(): string { return Article::class; }
    protected function field(): string { return 'articles'; }
    protected function noun(): string { return 'article'; }
    protected function usedColumn(): string { return 'article'; }

    /** What an article photo may be. Kept here so both entry points agree. */
    private const IMAGE_RULES = ['image', 'mimes:jpg,jpeg,png,webp', 'max:4096'];

    /**
     * A photo sent with the form belongs to the article(s) just created. The
     * modal usually adds one at a time; if several were typed they are the
     * same delivery, so they share the picture rather than one of them
     * silently getting it.
     */
    protected function afterStore(array $made, Request $request): void
    {
        $file = $request->file('image');

        if (! $file) {
            return;
        }

        $request->validate(['image' => self::IMAGE_RULES]);

        foreach ($made as $i => $article) {
            /* Each row owns its file, so removing one article never breaks
               another's picture. */
            $article->image = $this->put($file);
            $article->save();
        }
    }

    /**
     * Rename an article and/or change its photo in one go.
     *
     * A barcode records the article as text, so a rename has to sweep the
     * products too — otherwise the list says one thing and the stock behind
     * it says another. That rewrites what already-printed labels claim, which
     * is why this is Super Admin only, checked here as well as in the UI.
     */
    public function update(Request $request, int $id)
    {
        if (! $request->user()->isSuperAdmin()) {
            return response()->json([
                'message' => 'Only a Super Admin can edit an article.',
            ], 403);
        }

        $data = $request->validate([
            'label'        => ['required', 'string', 'max:120'],
            'image'        => self::IMAGE_RULES,
            'remove_image' => ['nullable', 'boolean'],
        ]);

        $article = Article::findOrFail($id);
        $label   = trim($data['label']);

        if ($label === '') {
            throw ValidationException::withMessages(['label' => 'The article number cannot be empty.']);
        }

        $clash = Article::whereKeyNot($id)
            ->whereRaw('LOWER(label) = ?', [mb_strtolower($label)])
            ->exists();

        if ($clash) {
            throw ValidationException::withMessages([
                'label' => "Article $label is already on the list.",
            ]);
        }

        $was   = $article->label;
        $moved = 0;

        DB::transaction(function () use ($request, $article, $label, $was, &$moved) {
            if ($label !== $was) {
                $moved = Product::where('article', $was)->update(['article' => $label]);
                $article->label = $label;
            }

            if ($request->boolean('remove_image') || $request->hasFile('image')) {
                $article->forgetImage();        // the old file is nobody's now
            }
            if ($request->hasFile('image')) {
                $article->image = $this->put($request->file('image'));
            }

            $article->save();
        });

        return response()->json([
            'articles' => $this->all(),
            /* The client repaints anything showing the old spelling. */
            'renamed'  => $label !== $was ? ['from' => $was, 'to' => $label] : null,
            'moved'    => $moved,
        ]);
    }

    public function destroy(int $id)
    {
        $article = Article::findOrFail($id);
        $response = parent::destroy($id);

        /* Only once the row is really gone — the parent refuses when stock
           exists, and that article still needs its picture. */
        if ($response->getStatusCode() < 400) {
            $article->forgetImage();
        }

        return $response;
    }

    private function put(UploadedFile $file): string
    {
        return $file->store(Article::IMAGE_DIR, 'public');
    }
}
