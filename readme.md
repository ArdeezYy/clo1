

# PRODUCT REQUIREMENTS DOCUMENT (PRD)
**Nama Produk:** MAGI Cryptosystem (Super Encryption System)
**Versi Dokumen:** 1.0.0
**Penulis / Pengembang:** Ardika Putra Hadian (101032300240)
**Mata Kuliah:** Keamanan Sistem, S1 Teknik Komputer, Universitas Telkom
**Tanggal:** April 2026

---

## 1. Ringkasan Eksekutif (*Executive Summary*)
MAGI Cryptosystem adalah sebuah perangkat lunak aplikasi berbasis web (*web-based application*) yang dirancang untuk mendemonstrasikan proses enkripsi dan dekripsi data secara absolut. Sistem ini mengimplementasikan konsep *Super Encryption* dengan menggabungkan tiga algoritma kriptografi yang berbeda (Playfair, Rail Fence, dan DES) ke dalam mode *Cipher Block Chaining* (CBC). Seluruh algoritma kriptografi dibangun murni dari awal (*from scratch*) tanpa menggunakan *library* kriptografi pihak ketiga, guna memenuhi standar akademik tertinggi dan membuktikan pemahaman manipulasi biner/byte tingkat rendah.

## 2. Tujuan Proyek (*Project Objectives*)
* **Tujuan Akademik:** Mencapai nilai evaluasi maksimal (100 Poin) pada Projek CLO 1 Keamanan Sistem dengan memenuhi seluruh kriteria bonus (implementasi mode Non-ECB, >2 metode kriptografi, dan pengolahan file non-teks/gambar).
* **Tujuan Teknis:** Membangun arsitektur *Full-Stack* yang dipisahkan (*Decoupled Architecture*) antara *Frontend* dan *Backend* untuk memaksimalkan performa pemrosesan matematis kriptografi.
* **Tujuan Pengguna:** Menyediakan antarmuka yang modern, cepat, dan mudah dipahami bagi pengguna untuk mengamankan data teks maupun gambar.

## 3. Arsitektur Sistem (*System Architecture*)
Sistem menggunakan arsitektur *Client-Server* yang di- *deploy* pada mesin Virtual Machine (VM) Ubuntu dengan spesifikasi 6-Core CPU dan RAM 8GB.

* **Frontend (Presentasi & UI):**
    * **Framework:** Next.js (React) berbasis TypeScript.
    * **UI Library:** Tailwind CSS dan shadcn/ui.
    * **Fungsi Utama:** Menangani interaksi pengguna, validasi input, dan pra-pemrosesan data (*Auto-Downscale* resolusi gambar secara lokal di *browser* sebelum dikirim ke server).
* **Backend (Mesin Komputasi Kriptografi):**
    * **Framework:** Python 3 + FastAPI.
    * **Fungsi Utama:** Menerima *request* dari Frontend, menjalankan algoritma kriptografi murni, dan mengembalikan hasil (teks/matriks gambar) melalui RESTful API.

## 4. Spesifikasi Mesin Kriptografi (*Cryptographic Engine Specification*)
Mesin utama (MAGI) dibagi menjadi tiga subsistem yang dieksekusi secara berurutan (*Sequential Layering*):

1.  **Layer 1: Subsistem Melchior (Playfair Cipher)**
    * **Kategori:** Kriptografi Klasik (Substitusi).
    * **Logika:** Memproses *array byte* menjadi pasangan *bigram* dan melakukan substitusi posisi berdasarkan matriks kunci.
2.  **Layer 2: Subsistem Balthasar (Rail Fence Cipher)**
    * **Kategori:** Kriptografi Klasik (Transposisi).
    * **Logika:** Melakukan permutasi atau pengacakan posisi elemen *byte* menggunakan alur zigzag berdasarkan nilai numerik *Depth*.
3.  **Layer 3: Subsistem Casper (DES dalam Mode CBC)**
    * **Kategori:** Kriptografi Modern (*Block Cipher*).
    * **Logika:** Data dipotong menjadi blok 64-bit. Setiap blok di-XOR dengan *Initialization Vector* (IV) atau blok *ciphertext* sebelumnya (Mode CBC). Setelah itu, blok masuk ke mesin DES yang terdiri dari *Initial Permutation*, 16-Ronde *Feistel Network*, matriks *S-Box*, *P-Box*, dan *Final Permutation*.

## 5. Kebutuhan Fungsional (*Functional Requirements*)

| ID | Nama Fitur | Deskripsi Fungsionalitas | Kriteria Penerimaan (*Acceptance Criteria*) |
| :--- | :--- | :--- | :--- |
| **FR-01** | **Pemilihan Mode Operasi** | Pengguna dapat memilih apakah ingin melakukan Enkripsi atau Dekripsi. | Sistem menyediakan *toggle/tabs* yang mengubah rute API antara `/encrypt` dan `/decrypt`. |
| **FR-02** | **Pemrosesan Data Teks** | Sistem dapat menerima input teks (string), memprosesnya melalui 3 layer, dan menghasilkan *ciphertext*. | Hasil enkripsi berupa format Hex/Base64. Dekripsi mengembalikan teks persis seperti semula tanpa karakter hilang. |
| **FR-03** | **Pemrosesan File Gambar** | Sistem dapat menerima file `.png` atau `.jpg`, mengubah *pixel* ke *byte array*, dan mengenkripsinya menjadi *noise* visual. | File gambar hasil enkripsi tidak *corrupt* (bisa dibuka oleh penampil gambar OS). Gambar hasil dekripsi memiliki piksel 100% sama dengan sumber. |
| **FR-04** | **Parameter Kunci Terpadu** | Pengguna wajib memasukkan 4 parameter unik untuk memulai operasi keamanan. | Tersedia input wajib untuk: Key Playfair (String), Depth Rail Fence (Integer), Key DES (Hex 64-bit), dan IV CBC (Hex 64-bit). |
| **FR-05** | **Auto-Downscale Resolusi** | Sistem Frontend akan memperkecil resolusi gambar ukuran besar secara otomatis. | Gambar dengan lebar/tinggi > 128px akan di-*resize* ke maksimal 128x128px sebelum dikirim via API untuk mencegah beban komputasi berlebih. |

## 6. Kebutuhan Non-Fungsional (*Non-Functional Requirements*)
1.  **Kinerja (Performance):** Berkat *Auto-Downscale* dan VM 6-Core, proses enkripsi satu file gambar (maks. 128x128 px) harus selesai dalam waktu di bawah **5 detik**.
2.  **Keandalan (Reliability):** REST API Backend (FastAPI) harus menangani *error handling* dengan baik (misal: memunculkan pesan HTTP 400 *Bad Request* jika kunci DES kurang dari 8 byte), tanpa membuat *server crash*.
3.  **Batasan Keamanan (Security Constraint):** Sistem tidak menyimpan data kunci (*Key/IV*) maupun file pengguna di *database* atau penyimpanan lokal server. Semuanya dihapus dari memori (*RAM*) tepat setelah respons API dikirim.

## 7. Desain Antarmuka (*User Interface & Experience*)
* **Tema:** Gelap (*Dark Mode*) secara *default* untuk memberikan kesan *cyberpunk/hacker*.
* **Layout Utama:**
    * *Header*: Logo dan Nama "MAGI Cryptosystem".
    * *Sidebar/Panel Kiri*: Form Input untuk seluruh Kunci dan Konfigurasi Mode.
    * *Main Area/Panel Kanan*: Area *drag-and-drop* file gambar, *text area* untuk pesan input, dan area *preview* hasil (*output*).
* **Feedback:** Menggunakan komponen *Toast/Sonner* dari shadcn untuk memberitahu pengguna jika proses "Berhasil" atau "Gagal". Tombol "Eksekusi" akan menampilkan animasi *spinner* selama sistem melakukan komputasi.

## 8. Di Luar Cakupan (*Out of Scope*)
Untuk menjaga fokus pengembangan, spesifikasi berikut dinyatakan di luar cakupan rilis versi 1.0.0:
1.  Pemrosesan dokumen multi-media lainnya (Video, Audio, PDF, DOCX).
2.  Enkripsi gambar beresolusi tinggi (misal: 1080p, 4K) karena limitasi kecepatan *script* Python murni.
3.  Sistem Autentikasi/Login pengguna (Sistem bebas diakses oleh siapa saja yang memiliki *link* URL VM).

## 9. Kriteria Persetujuan Proyek (*Sign-off / Success Metrics*)
Proyek dianggap sukses dan siap dipresentasikan jika:
1.  Tidak ada satupun *library* seperti `pycryptodome` atau `cryptography` yang terdeteksi di dalam *source code* Python.
2.  Aplikasi berhasil di-*deploy* di VM Ubuntu dan dapat diakses publik melalui *browser*.
3.  Uji coba enkripsi-dekripsi *string* NIM pengguna (`101032300240`) dan gambar profil berhasil tanpa mengalami kehilangan data (*lossless*).
