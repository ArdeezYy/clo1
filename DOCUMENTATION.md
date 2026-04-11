# DOCUMENTATION

## Gambaran Umum

Sistem kriptografi pada aplikasi ini menggunakan satu `master key` untuk
membangkitkan seluruh parameter yang dibutuhkan oleh tiga lapisan transformasi:

1. Playfair 16 x 16 berbasis byte
2. Rail Fence transposition
3. DES-CBC

Urutan enkripsi adalah:

`plaintext -> length header -> Playfair -> Rail Fence -> DES-CBC -> ciphertext`

Urutan dekripsi adalah kebalikannya:

`ciphertext -> DES-CBC -> Rail Fence -> Playfair -> strip length header -> plaintext`

Dokumentasi ini hanya menjelaskan cara kerja kriptografinya.

## 1. Derivasi Parameter Dari Master Key

Semua parameter operasional diturunkan secara deterministik dari satu
`master key`. Validasi yang dipakai saat ini:

- panjang minimal 16 karakter
- panjang maksimal 128 karakter

Master key kemudian diproses oleh fungsi derivasi berbasis `SHA-256`. Untuk
setiap kebutuhan parameter, sistem membangun blok:

`masterKey || 0x00 || label || counter`

Lalu blok tersebut di-hash dengan SHA-256 berulang sampai jumlah byte yang
dibutuhkan terpenuhi.

Label yang dipakai:

- `playfair-key`
- `rail-depth`
- `des-key`
- `des-iv`

Hasil derivasi dipetakan menjadi:

- `playfairKey`: 24 karakter dari alfabet `A-Z`, `0-9`, `-`, `_`
- `railFenceDepth`: `(byte % 7) + 2`, sehingga nilainya berada pada rentang 2..8
- `desKeyHex`: 8 byte kunci DES, disajikan sebagai 16 karakter hex
- `ivHex`: 8 byte initialization vector, disajikan sebagai 16 karakter hex

Karena seluruh parameter diturunkan dari master key yang sama, proses dekripsi
akan menghasilkan parameter identik selama master key yang dimasukkan sama.

## 2. Representasi Data Dasar

### Teks

Payload teks dikonversi ke byte menggunakan UTF-8 sebelum dienkripsi.

### Gambar

Payload gambar didekode menjadi data RGBA mentah. Byte RGBA inilah yang masuk
ke pipeline kriptografi. Setelah proses selesai, hasil byte dikemas kembali
sebagai gambar PNG.

## 3. Length Header

Sebelum masuk ke lapisan cipher, sistem menambahkan header panjang payload
sebesar 4 byte di awal data.

Tujuan header ini:

- menyimpan panjang asli payload
- memungkinkan sistem membedakan data asli dengan byte padding tambahan
- memungkinkan hasil dekripsi dipotong kembali ke panjang semula

Formatnya adalah `uint32` big-endian:

- 4 byte pertama berisi panjang payload asli
- sisa byte berisi data asli

Jika total panjang setelah penambahan header menjadi ganjil, sistem menambahkan
1 byte nol di akhir agar ukuran data genap untuk tahap Playfair.

## 4. Playfair 16 x 16 Berbasis Byte

Lapisan pertama adalah variasi Playfair yang bekerja pada domain penuh 256
nilai byte, bukan alfabet huruf biasa.

### 4.1 Pembuatan Tabel

Tabel Playfair dibentuk sebagai matriks `16 x 16` berisi seluruh nilai byte
`0..255`.

Langkah pembuatannya:

1. `playfairKey` dikonversi ke byte UTF-8
2. byte yang muncul pertama kali dimasukkan ke tabel tanpa duplikasi
3. seluruh byte `0..255` yang belum ada ditambahkan berurutan

Dengan cara ini, urutan tabel sepenuhnya ditentukan oleh `playfairKey`.

### 4.2 Proses Transformasi

Data diproses per pasangan 2 byte.

Untuk setiap pasangan byte:

- jika kedua byte berada pada baris yang sama, kolom digeser
  - enkripsi: geser ke kanan 1
  - dekripsi: geser ke kiri 1
- jika kedua byte berada pada kolom yang sama, baris digeser
  - enkripsi: geser ke bawah 1
  - dekripsi: geser ke atas 1
- selain itu, dipakai aturan persegi panjang
  - byte pertama mengambil kolom byte kedua
  - byte kedua mengambil kolom byte pertama

Perpindahan indeks memakai operasi wrap, sehingga pergeseran melewati batas
tabel akan kembali ke sisi awal.

## 5. Rail Fence Transposition

Setelah Playfair, hasil byte diproses dengan Rail Fence.

### 5.1 Enkripsi

Byte ditulis mengikuti lintasan zig-zag pada sejumlah rel sesuai
`railFenceDepth`, lalu seluruh rel dibaca dari atas ke bawah.

Contoh bentuk lintasan:

`0 -> 1 -> 2 -> ... -> depth-1 -> depth-2 -> ... -> 1 -> 0`

### 5.2 Dekripsi

Pada dekripsi, sistem:

1. membangun ulang lintasan zig-zag untuk panjang ciphertext
2. menghitung berapa byte jatuh pada setiap rel
3. memotong ciphertext sesuai jumlah byte tiap rel
4. merakit ulang urutan byte asli berdasarkan lintasan yang sama

Rail Fence di sini murni transposisi, sehingga tidak mengubah nilai byte,
hanya posisi byte.

## 6. DES-CBC

Lapisan terakhir adalah DES dalam mode CBC.

### 6.1 Kunci dan IV

- kunci DES: 8 byte hasil derivasi `des-key`
- IV: 8 byte hasil derivasi `des-iv`

Keduanya dikirim dan dipakai dalam bentuk byte, walaupun di internal sering
ditampilkan sebagai string hex 16 karakter.

### 6.2 Padding

Sebelum enkripsi, data dipadding dengan `PKCS#7` ke ukuran blok 8 byte.

Aturan padding:

- jika data belum kelipatan 8, sistem menambahkan `n` byte bernilai `n`
- jika data sudah kelipatan 8, sistem tetap menambahkan 1 blok penuh padding

Saat dekripsi, padding diverifikasi lalu dihapus. Jika format padding tidak
sesuai, proses gagal.

### 6.3 Mekanisme CBC

Enkripsi blok bekerja sebagai berikut:

1. blok plaintext di-XOR dengan blok sebelumnya
2. untuk blok pertama, "blok sebelumnya" adalah IV
3. hasil XOR diproses oleh DES block cipher
4. output blok menjadi referensi untuk blok berikutnya

Dekripsi blok bekerja sebagai berikut:

1. blok ciphertext didekripsi dengan DES
2. hasilnya di-XOR dengan blok ciphertext sebelumnya
3. untuk blok pertama, XOR dilakukan terhadap IV

Implementasi DES di dalam kode meliputi:

- initial permutation (`IP`)
- 16 ronde Feistel
- expansion permutation (`E`)
- S-Box substitution
- permutation (`P`)
- key schedule dengan `PC1`, `PC2`, dan rotasi 28-bit
- final permutation (`FP`)

## 7. Format Ciphertext Teks

Untuk payload teks, hasil akhir DES-CBC diserialisasi sebagai:

`MAGI2.` + hex(cipherBytes)

Contoh bentuk umum:

`MAGI2.4FA1...`

Aturannya:

- marker wajib diawali `MAGI2.`
- setelah marker, seluruh isi harus berupa hex dengan panjang genap

Saat dekripsi, sistem:

1. memverifikasi marker `MAGI2.`
2. mengubah bagian hex menjadi byte
3. memasukkan byte tersebut ke pipeline dekripsi

## 8. Format Payload Gambar

Untuk payload gambar, ciphertext byte tidak ditampilkan sebagai string hex.
Sebaliknya, byte hasil DES-CBC dikemas ke data gambar PNG.

Alur logisnya:

1. gambar input diubah ke RGBA mentah
2. RGBA mentah dienkripsi oleh pipeline yang sama
3. ciphertext byte dikemas ke representasi gambar
4. hasil dikirim sebagai `data URL` PNG

Pada dekripsi:

1. PNG terenkripsi didekode
2. ciphertext byte diekstrak dari format gambar
3. pipeline dekripsi dijalankan
4. byte hasil dikembalikan lagi menjadi PNG biasa

## 9. Alur Enkripsi Lengkap

Untuk payload teks:

1. validasi master key
2. turunkan `playfairKey`, `railFenceDepth`, `desKeyHex`, dan `ivHex`
3. ubah plaintext ke UTF-8 bytes
4. tambahkan header panjang 4 byte
5. jika perlu, tambahkan 1 byte agar panjang genap
6. enkripsi dengan Playfair 16 x 16
7. transposisi dengan Rail Fence
8. enkripsi dengan DES-CBC + PKCS#7
9. serialisasi ke format `MAGI2.<hex>`

Untuk payload gambar:

1. validasi master key
2. turunkan parameter yang sama
3. decode gambar ke RGBA bytes
4. jalankan pipeline byte yang sama seperti mode teks
5. kemas ciphertext ke PNG

## 10. Alur Dekripsi Lengkap

Untuk payload teks:

1. validasi master key
2. turunkan parameter yang sama dari master key
3. validasi marker `MAGI2.`
4. ubah hex ciphertext ke byte
5. dekripsi DES-CBC
6. balikkan Rail Fence
7. balikkan Playfair
8. baca header panjang
9. ambil kembali payload asli sesuai panjang header
10. decode byte ke UTF-8

Untuk payload gambar:

1. validasi master key
2. turunkan parameter yang sama
3. decode PNG terenkripsi
4. ekstrak ciphertext byte
5. dekripsi dengan pipeline terbalik
6. kembalikan hasil ke PNG biasa

## 11. Sifat Sistem

Beberapa sifat penting dari rancangan ini:

- deterministik terhadap master key, karena seluruh parameter diturunkan dari
  key yang sama
- menggunakan kombinasi substitusi, transposisi, dan block cipher
- memakai domain byte penuh pada lapisan Playfair, sehingga dapat menangani
  data biner
- mendukung payload teks dan gambar karena pipeline inti bekerja pada byte

## 12. Ringkasan Singkat

Inti desain kriptografi sistem ini adalah:

- satu master key menghasilkan semua parameter
- payload dibungkus dengan header panjang
- payload diproses oleh Playfair byte-based
- hasilnya ditransposisikan dengan Rail Fence
- hasil akhirnya dienkripsi dengan DES-CBC
- dekripsi membalik seluruh langkah tersebut dalam urutan terbalik
