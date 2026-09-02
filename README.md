# StockFlow — Inventory & Barcode Manager

Shoe-trade inventory system. Every physical pair carries its own barcode, so
stock is tracked pair by pair rather than as a quantity column: generate,
sell, return, write off, and report on each one individually.

**Stack:** Laravel 12 · PHP 8.2 · MySQL · vanilla-JS single-page frontend.

---

## Running it locally

Requires PHP 8.2+ (XAMPP is fine), MySQL, and Composer.

```bash
composer install
cp .env.example .env
php artisan key:generate
```

Point `.env` at your database, then:

```bash
php artisan migrate --seed
php artisan serve
```

Open the URL `serve` prints. The starting accounts are:

| User ID    | Password   | Role        |
|------------|------------|-------------|
| `mdshazid` | `123456`   | Super Admin |
| `Admin`    | `12345678` | Admin       |

Change both before this goes anywhere real — they are seed values, committed
in plain sight, and only bcrypt-hashed once they reach the database.

### Serving from XAMPP instead

Point a vhost `DocumentRoot` at `public/`. Never expose the project root
itself: `.env` sits there, and `public/` is the only directory meant to be
web-reachable.

---

## How it is put together

The frontend is the original prototype's markup and render code, unchanged in
shape. What changed is where its data comes from.

```
GET  /api/bootstrap   -> the whole dataset, in the shape the renderers expect
POST /api/products    -> mint N barcodes
POST /api/sales       -> confirm a stock-out
POST /api/returns     -> customer return, or damage write-off
```

`resources/views/app.blade.php` is the single page. `public/js/app.js` holds a
`db` object that mirrors the server; every render function reads from it
exactly as it did when that object lived in `localStorage`. Only API responses
write to it.

### Things the database decides, not the browser

These are the parts that could not stay client-side once more than one person
uses the system at a time:

- **Barcode numbers.** `counters` is bumped under `SELECT ... FOR UPDATE`, and
  a batch of N reserves all N in one step. Two terminals generating at the
  same moment cannot mint the same code.
- **Stock status.** Selling locks the product rows and re-checks each one. A
  pair sold on another terminal between your scan and your click is rejected
  with a 409, and the frontend reloads rather than showing stale stock.
- **Permissions.** The sidebar hides modules a role cannot use, but every
  route is gated again by `EnsureModuleAccess`. Hiding a button is not access
  control.
- **Prices actually charged.** `sale_items.price` records what was billed, so
  a later price edit or resale cannot rewrite an old invoice.

### Roles

`Role::MODULES` lists every gateable module. A role stores a `{module: bool}`
map; anything missing from it reads as `false`, so a module added in a later
version does not silently become accessible to everyone.

Super Admin is special in three places: its permissions are forced to "all" on
every boot, its role cannot be edited or deleted, and the last enabled Super
Admin cannot be disabled. Without those, an install can be locked out of its
own permission screens with no way back.

---

## Layout

```
app/Http/Controllers/   one per module, plus Auth and Bootstrap
app/Http/Middleware/    EnsureModuleAccess
app/Models/             Eloquent models; toWire() defines the JSON shape
app/Support/Codes.php   atomic sequence numbers
database/migrations/    one migration holds the whole schema
database/seeders/       roles, users, and a little starter data
public/js/app.js        the SPA
public/js/barcode.js    Code 128 renderer, no dependencies
public/js/combo.js      searchable select
resources/views/        app.blade.php
```
