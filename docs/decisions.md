# Quyết Định Sản Phẩm (Product Decisions)

> **Ngày chốt:** 24/11/2026  
> **Nguồn tham chiếu:** [AUDIT_REPORT.md](AUDIT_REPORT.md) & [CLAUDE.md](../CLAUDE.md)  
> **Phạm vi tài liệu:** Ghi lại các quyết định sản phẩm cho 5 mục **A12, C3, B1, C1, C4** (và các ý tưởng mở rộng phát sinh trong quá trình thảo luận) để làm cơ sở cho bước viết đặc tả (spec) sau này. Chưa thay đổi mã nguồn.

---

## Tóm Tắt Nhanh

| Mục | Chủ đề | Quyết định đã chốt (đợt này) | Tách sang giai đoạn sau |
| :---: | :--- | :--- | :--- |
| **A12** | Chặn dồn tiền bù giảm giá lên 1–2 người | Khóa trần tiền bù tối đa **+30%** mức gốc cho mỗi người đủ trận; nếu vẫn hụt thì co nhẹ mức giảm của nhóm đánh ít (kèm cảnh báo) | — |
| **C3** | Chia tiền bù giảm giá theo giới tính | Chia tiền bù **đúng theo tinh thần từng chế độ**: Tỷ lệ Nam/Nữ thì bù theo tỷ lệ Nam/Nữ; Nam đóng thêm cố định thì bù đều để giữ đúng mức chênh | — |
| **B1** | Ca vừa khít người (8 người / 2 sân chung, 0 người chờ) | **Để trống** ô Lượt kế tiếp khi 0 người chờ ở chế độ nhiều sân chung (chờ sân xong để trộn, hoặc chủ sân bấm *Gợi ý kèo* tay nếu muốn đánh tiếp ngay) | **Chú ý đặc biệt:** Ghi nhanh tỉ số / nhận xét kèo (có nút Bỏ qua) + AI (Gemini) phân tích lệch trình & gợi ý xếp sân |
| **C1** | Bấm *Gợi ý lại* khi đã chọn tay 1–2 người | **Luôn giữ nguyên** các ô chủ sân đã chọn tay (đúng đội), chỉ tự điền hoặc xoay đổi các ô còn lại; muốn đổi hết cả 4 người thì bấm *Xóa trắng* | — |
| **C4** | Đồng bộ bảng Tính tiền lên phòng Online | Đồng bộ đầy đủ bảng tính tiền (Chủ & Phó sân cùng sửa/duyệt; Thành viên chỉ xem) + **nút nhẹ "Tôi đã chuyển"** (3 trạng thái: *Chưa đóng → Chờ duyệt → Đã đóng ✅*, chưa tải ảnh) | Đính kèm **ảnh biên lai chuyển khoản** để Chủ/Phó sân xem và duyệt trực tiếp (kiểu app Alobo) |

---

## Chi Tiết Từng Quyết Định

### 1. Mục A12 — Khóa trần tiền bù giảm giá cho người đánh đủ trận

- **Tình huống thực tế:**  
  Buổi đánh hết **800.000đ**, có **8 người** chia đều (mức gốc **100.000đ/người**), đang bật giảm 50% cho người đánh ≤ 2 trận. Nếu nghỉ sớm có **7 người đánh 2 trận** và chỉ **1 người (anh Nam) đánh 3 trận**, trước đây toàn bộ 350.000đ tiền hụt dồn hết lên 1 mình anh Nam (phải đóng **450.000đ**, hoặc trọn **800.000đ** nếu đang bật miễn phí ≤ 2 trận).
- **Quyết định đã chốt:**
  1. Đặt **trần tiền bù tối đa là +30% mức chia gốc** trên mỗi người thuộc nhóm đánh đủ trận (trong ví dụ trên, anh Nam chỉ bù thêm tối đa 30.000đ → đóng tối đa **130.000đ**).
  2. Nếu tổng tiền hụt do giảm giá vượt quá tổng hạn mức bù cho phép của nhóm đánh đủ trận, ứng dụng **tự động co nhẹ mức giảm của nhóm đánh ít** (theo tỷ lệ mức giảm dự kiến của từng người) sao cho tổng thu vẫn đảm bảo đủ 100% tổng chi phí sân + cầu (trong ví dụ trên, 7 người đánh 2 trận đóng **96.000đ/người**, vẫn thấp hơn anh Nam 34.000đ và chủ sân không bị lỗ).
  3. Hiển thị **cảnh báo rõ ràng** trên bảng tính tiền (và ghi chú dễ hiểu) khi mức giảm bị co lại do chạm trần bù +30%.
  4. Trong các buổi bình thường (khi đủ nhiều người đánh đủ trận nên phần bù không vượt +30%), mức giảm giá hoạt động đúng nguyên bản như cài đặt.
- **Các phương án đã cân nhắc & lý do không chọn:**
  - *Chuyển sang chia theo tỷ lệ số trận cả nhóm khi dưới 50% đủ trận:* Dễ gây chênh lệch mạnh nếu 1 người đánh 4 trận còn 7 người đánh 1 trận, và khó nhẩm tay khi kết hợp chia Nam/Nữ.
  - *Tự động hủy hẳn giảm giá khi dưới 50% đủ trận:* Quá cứng, không phân biệt được người đến rất muộn mới đánh 1 trận với người đánh 3 trận.
- **Tương thích Quy chuẩn (`CLAUDE.md`):** Giữ nguyên toàn bộ Rule 4 (tỷ lệ cá nhân Nam/Nữ và mức giá mặc định).

---

### 2. Mục C3 — Cách chia phần tiền bù giảm giá giữa Nam và Nữ

- **Tình huống thực tế:**  
  Buổi đánh hết **800.000đ**, gồm **4 Nam + 4 Nữ**, chia theo **tỷ lệ Nam/Nữ 65 : 35** (mức gốc: Nam **130.000đ**, Nữ **70.000đ**). Có **1 Nam + 1 Nữ về sớm** được giảm 50% → hụt **100.000đ** cần bù vào 6 người ở lại (3 Nam + 3 Nữ). Nếu chia đều 100.000đ cho 6 người (~16.700đ/người), Nam đóng 147.000đ (+13%) còn Nữ đóng 87.000đ (+24%), làm tỷ lệ thực tế bị kéo lệch từ 65:35 thành 63:37.
- **Quyết định đã chốt:**  
  Phân bổ phần tiền bù giảm giá **đúng theo bản chất của từng chế độ chia tiền**:
  1. **Chế độ Tỷ lệ Nam/Nữ (ví dụ 65 : 35):** Tiền bù được chia theo đúng tỷ lệ Nam/Nữ đã chọn (trong ví dụ trên: Nam bù ~21.700đ → **152.000đ**, Nữ bù ~11.700đ → **82.000đ**, giữ trọn tỷ lệ 65:35 và cùng tăng +16,7%).
  2. **Chế độ Nam đóng thêm cố định (ví dụ Nam hơn Nữ +20.000đ):** Tiền bù được chia đều theo đầu người trong nhóm đủ trận để giữ đúng mức chênh lệch cố định +20.000đ giữa Nam và Nữ.
  3. **Chế độ Chia đều:** Tiền bù chia đều theo đầu người như bình thường.
- **Lưu ý phối hợp giữa A12 và C3:**
  - Ở chế độ **Tỷ lệ Nam/Nữ**, do cả Nam và Nữ đều tăng cùng một phần trăm so với mức gốc nên khi chạm trần **+30%** của mục A12, cả hai giới chạm trần hoàn toàn đồng bộ và vẫn giữ đúng tỷ lệ Nam/Nữ.
  - Ở chế độ **Nam đóng thêm cố định (+X đồng)**, nếu xảy ra trường hợp hiếm có nhóm chạm trần +30% trước, ưu tiên giữ đúng cam kết mục A12 (**không ai vượt quá +30% mức gốc** và **tổng thu luôn đủ chi phí**) và hiển thị cảnh báo rõ (chi tiết công thức biên sẽ chốt ở bước viết spec).
- **Các phương án đã cân nhắc & lý do không chọn:**
  - *Luôn chia tiền bù theo tỷ lệ mức gốc cho mọi chế độ:* Làm sai lệch mức chênh cố định "+20.000đ" ở chế độ Nam đóng thêm cố định.
  - *Giữ nguyên chia đều đầu người:* Làm méo tỷ lệ Nam/Nữ khi nhiều người về sớm và khiến Nữ chạm trần +30% trước Nam.
- **Tương thích Quy chuẩn (`CLAUDE.md`):** Củng cố đúng tinh thần Rule 4 (giữ vững tỷ lệ mức đóng giữa 1 cá nhân Nam và 1 cá nhân Nữ).

---

### 3. Mục B1 — Tình huống vừa khít người, 0 người chờ ở chế độ nhiều sân chung

- **Tình huống thực tế:**  
  Buổi đánh có đúng **8 người** trên **2 sân chung** (Sân 1: A–B đấu C–D; Sân 2: E–F đấu G–H; 0 người ngồi chờ). Trước đây, ngay khi Sân 2 bắt đầu trận, máy tự điền lại đúng 4 người E–F–G–H vào Lượt kế tiếp của Sân 2. Nếu chủ sân bấm *Kết thúc & Vào lượt mới*, 2 sân bị "nhốt" thành 2 nhóm 4 người tách biệt suốt cả buổi, không trộn người dù 2 sân kết thúc gần nhau.
- **Quyết định đã chốt (cho đợt này):**
  1. Khi đang ở chế độ **nhiều sân đánh chung (từ 2 sân đang bật trở lên)** và có **0 người đang ngồi chờ**, ứng dụng **không tự động điền sẵn** 4 người đang đánh vào ô Lượt kế tiếp ngay lúc bắt đầu trận — để ô Lượt kế tiếp **trống**.
  2. Khi 1 sân kết thúc, chủ sân bấm nút kết thúc (nút sẵn có *"Chỉ kết thúc"* / *"Kết thúc trận"*):
     - Nếu chờ sân kia xong (cả 8 người rảnh) rồi bấm **"Gợi ý kèo"** → máy tự động trộn người giữa 2 sân.
     - Nếu sân kia còn đánh lâu và 4 người vừa xong muốn đánh tiếp ngay → chủ sân chủ động bấm **"Gợi ý kèo"** ở sân đó để xếp lại cặp mới cho 4 người.
  3. **Ngoại lệ giữ nguyên tự điền:** Nếu buổi đó chỉ bật đúng **1 sân duy nhất** (4 người / 1 sân) hoặc đang bật chế độ **chia sân riêng từng nhóm**, vẫn cho phép tự điền sẵn lượt tiếp theo như trước vì nhóm đó vốn cố định 4 người.
- **Các phương án đã cân nhắc & lý do không chọn:**
  - *Vẫn tự điền sẵn 4 người cũ kèm nhãn nhắc màu vàng:* Trên sân thực tế dễ bị bấm nhầm theo quán tính vào nút *Kết thúc & Vào lượt mới*.
  - *Không sửa B1 đợt này / hoãn hẳn:* Dù nhóm ít người ít dùng app hơn nhóm đông, việc sửa để trống rất gọn nhẹ, an toàn và không ảnh hưởng nhóm đông.
- **Tương thích Quy chuẩn (`CLAUDE.md`):** Tuân thủ tuyệt đối Rule 2 — không có hiệu ứng domino làm nhảy đội hình của sân khác.

---

### 4. Mục C1 — Giữ người chủ sân đã chọn tay khi bấm "Gợi ý lại"

- **Tình huống thực tế:**  
  Sân đông 12 người (8 người ngồi chờ). Anh Hùng xin đánh nốt 1 trận cặp cùng chị Lan rồi về sớm. Chủ sân tự chọn tay **Hùng + Lan** vào Đội 1 (2 ô Đội 2 đang trống) rồi bấm **"Gợi ý lại"** để máy tự tìm 2 đối thủ cân kèo nhất. Trước đây bấm *"Gợi ý lại"* xóa sạch cả 4 ô, hất luôn Hùng và Lan ra ngoài.
- **Quyết định đã chốt:**
  1. Khi chủ sân bấm **"Gợi ý kèo"** hoặc **"Gợi ý lại"** tại một sân, ứng dụng **luôn giữ cố định những người chủ sân đã chọn tay** (đúng vị trí đội mà chủ sân đã đặt — ví dụ cùng 1 đội để giữ cặp, hoặc ở 2 đội khác nhau để ghép đối đầu).
  2. Máy chỉ tự động tìm, điền và cân kèo cho **các ô còn lại** (ô trống hoặc ô do máy tự điền ở lần gợi ý trước).
  3. Nếu bấm **"Gợi ý lại"** nhiều lần liên tiếp khi đã có ô chọn tay, máy vẫn giữ nguyên các ô chọn tay và xoay đổi các phương án ghép tối ưu cho những ô còn lại.
  4. Khi muốn bỏ người chọn tay để máy gợi ý mới hoàn toàn cả 4 vị trí, chủ sân bấm **"Xóa trắng"** (hoặc bấm dấu `X` gỡ từng ô chọn tay) rồi bấm **"Gợi ý kèo"**.
  5. Áp dụng thống nhất cho cả kèo Đôi (4 ô) và kèo Đơn (2 ô).
- **Các phương án đã cân nhắc & lý do không chọn:**
  - *Chỉ giữ người chọn tay khi còn ô trống, đầy 4 ô thì ghi đè hết:* Bất tiện khi chủ sân chưa ưng cặp đối thủ máy vừa gợi ý và muốn bấm *Gợi ý lại* để đổi đối thủ khác mà vẫn giữ cặp đã chọn tay.
  - *Giữ nguyên ghi đè cả 4 ô:* Mất công chọn tay của chủ sân, bắt buộc phải tự mò chọn tay đủ 4 người.
- **Tương thích Quy chuẩn (`CLAUDE.md`):** Hoàn toàn phù hợp và tăng cường Rule 2 (độc lập từng sân, tôn trọng tuyệt đối thao tác chọn tay của chủ sân).

---

### 5. Mục C4 — Đồng bộ bảng Tính tiền lên phòng Online + Luồng "Báo đã chuyển / Duyệt"

- **Tình huống thực tế:**  
  Cuối buổi chủ sân nhập tiền sân, số quả cầu, chọn tỷ lệ chia Nam/Nữ, điền số tài khoản ngân hàng và bắt đầu thu tiền. Phó sân muốn phụ thu tiền mặt giúp chủ sân; còn thành viên mở link phòng Online muốn tự xem số tiền của mình, lấy số tài khoản chuyển khoản và báo đã chuyển để đỡ phải nhắn qua Messenger/Zalo.
- **Quyết định đã chốt (đợt này):**
  1. **Đồng bộ đầy đủ bảng tính tiền lên phòng Online:** Bao gồm cài đặt tiền sân, tiền cầu, phụ phí, chế độ chia tiền, giảm giá, thông tin chuyển khoản ngân hàng và danh sách trạng thái đóng tiền của từng người.
  2. **Phân quyền rõ ràng:**
     - **Chủ sân & Phó sân (đã nhập mã PIN):** Cùng xem, chỉnh sửa cài đặt tính tiền và bấm **Duyệt đã đóng ✅** (hoặc hoàn tác duyệt) cho mọi thành viên.
     - **Thành viên xem qua link phòng:** Chỉ được **xem** bảng tính tiền và thông tin chuyển khoản (không sửa được tiền sân/cầu hay cách chia).
  3. **Luồng báo chuyển khoản nhẹ gồm 3 trạng thái (chưa tải ảnh ở đợt này):**
     - **Chưa đóng** (mặc định).
     - **Chờ duyệt** (nhãn vàng): Thành viên xem link có thể bấm nút nhẹ **"Tôi đã chuyển"** ngay cạnh tên mình sau khi chuyển khoản → máy Chủ sân và Phó sân lập tức thấy ai đã báo chuyển, ai chưa.
     - **Đã đóng ✅** (nhãn xanh): Chủ sân hoặc Phó sân đối chiếu biến động số dư ngân hàng / tiền mặt rồi bấm **"Duyệt ✅"** xác nhận (có thể bấm hoàn tác nếu kiểm tra chưa nhận được tiền).
  4. **Dọn trạng thái khi sang buổi mới:** Khi tạo buổi mới (giữ danh sách người chơi), tự động xóa sạch trạng thái *Chờ duyệt / Đã đóng* của buổi cũ (giữ lại cài đặt giá sân/cầu và thông tin ngân hàng quen dùng).
- **Các phương án đã cân nhắc & lý do không chọn:**
  - *Chỉ đồng bộ giữa Chủ & Phó sân, ẩn với Thành viên:* Thành viên không tự tra cứu tiền và không tự báo đã chuyển được, vẫn phải hỏi trên nhóm chat.
  - *Làm trọn gói cả tải ảnh biên lai ngay đợt này:* Nặng về hạ tầng kho lưu ảnh, nén ảnh 4G, tự dọn ảnh cũ và chống spam; nên tách sang giai đoạn mở rộng riêng trên chính nền tảng 3 trạng thái đã dựng sẵn ở đợt này.
- **Tương thích Quy chuẩn (`CLAUDE.md`):** Tuân thủ Rule 3 — đồng bộ bảng tính tiền không đưa vào lịch sử Hoàn tác (Undo), giữ cơ chế chống vòng lặp và chống đè thao tác cục bộ.

---

## Ý Tưởng Phát Triển Giai Đoạn Sau (Chú Ý Đặc Biệt — Chưa Làm Đợt Này)

Hai hướng phát triển lớn dưới đây được chủ sản phẩm đề xuất trong buổi trao đổi, tách riêng khỏi đợt sửa lỗi & cải tiến lõi hiện tại để nghiên cứu và thiết kế kỹ lưỡng ở giai đoạn sau:

### A. Đánh giá độ cân kèo sau trận (Tỉ số / Nhận xét nhanh) + AI (Gemini) phân tích trình độ *(Chú ý đặc biệt)*
- **Nhu cầu thực tế:** Đánh giá trình độ người chơi trong nhóm cầu lông ngoài đời khá nhạy cảm và khó phân định chính xác ngay từ đầu. Nếu một trận đánh **quá chênh lệch**, trận sau nên tách cặp hoặc gợi ý xem lại mức trình; ngược lại nếu trận **sát nút / cân kèo hay**, có thể cho đánh tiếp hoặc ghi nhận mức trình hiện tại là hợp lý.
- **Ý tưởng luồng sử dụng:**
  - Khi bấm kết thúc trận, cho phép nhập nhanh **tỉ số** (ví dụ 21–19 hoặc 21–9), hoặc chỉ bấm nhanh **nhận xét 1 chạm** (*"Cân / Hay"* vs *"Chênh quá"*), hoặc bấm **Bỏ qua (Skip)** nếu sân đông không kịp hỏi (khi bỏ qua thì mặc định coi là trận đều bình thường, không làm chậm nhịp điều phối sân).
  - Kết nối **AI (Gemini)** đọc lịch sử tỉ số / nhận xét của buổi đánh (và nhiều buổi) để phân tích xem ai đang bị xếp trình cao/thấp hơn thực tế, từ đó **đề xuất điều chỉnh trình độ** hoặc **gợi ý tách/giữ cặp** cho chủ sân tham khảo.
- **Lưu ý đặc biệt cần thiết kế kỹ ở giai đoạn riêng:** Tránh gây cảm giác "chấm điểm phán xét" làm mất vui trong hội nhóm; đảm bảo AI chỉ đưa gợi ý kín cho chủ sân quyết định, không tự ý nhảy trình làm rối buổi đánh, và hoạt động mượt kể cả khi mất mạng hoặc không kịp nhập tỉ số.

### B. Nộp ảnh biên lai chuyển khoản & Chủ/Phó sân duyệt trực tiếp (kiểu app Alobo)
- **Nhu cầu thực tế:** Với nhóm đông (15–20 người), khi thành viên chuyển khoản xong có thể gửi ảnh chụp màn hình biên lai trực tiếp vào đúng tên mình trên bảng Tính tiền (tương tự luồng đặt sân trên app Alobo), giúp Chủ sân / Phó sân mở ra xem ảnh và duyệt ngay mà không cần lội tin nhắn Messenger/Zalo.
- **Nền tảng đã chuẩn bị ở đợt này:** Mục C4 đợt này dựng sẵn luồng 3 trạng thái (*Chưa đóng → Chờ duyệt → Đã đóng ✅*) để giai đoạn sau chỉ việc gắn thêm phần đính kèm ảnh vào bước *Chờ duyệt*.
- **Các điểm cần thiết kế kỹ ở giai đoạn riêng:** Thiết lập kho lưu trữ ảnh trên đám mây, nén ảnh nhỏ trên điện thoại để mạng 4G ở sân gửi nhanh, chính sách tự động xóa ảnh biên lai cũ sau thời hạn nhất định (vd 7–30 ngày) để tránh đầy dung lượng miễn phí, và biện pháp chống gửi nhầm tên hoặc gửi ảnh rác khi thành viên truy cập bằng link phòng không cần đăng nhập.

---

# Phần 2 — Quyết Định Sản Phẩm Đợt 2 (Nâng Cấp Thực Chiến)

> **Ngày chốt:** 24/11/2026 (sau khi hoàn tất & push Đợt 1 gồm A12, C3, B1, C1, C4)  
> **Cơ sở khảo sát:** Phỏng vấn trực tiếp Chủ sản phẩm kết hợp khảo sát các vấn đề thực tế phổ biến của hội nhóm cầu lông phong trào Việt Nam (Facebook, Threads, trải nghiệm thu tiền/xếp kèo vãng lai & Alobo).

## Tóm Tắt Phạm Vi Đợt 2

| Nhóm | Tính năng | Trạng thái | Tóm tắt quyết định đã chốt |
| :---: | :--- | :---: | :--- |
| **Nhóm 1** | Nhận xét sau trận + AI (Gemini) phân tích trình độ | **LÀM ĐỢT 2** | Bảng nhận xét nhanh sau trận (có nút **Bỏ qua** + công tắc tắt/bật nhanh + sửa lại trong Lịch sử). Tỉ số, độ cân kèo & **thẻ nhận xét từng người** (`↑ Vượt trình`, `↓ Hơi đuối`, `★ Đánh hay`, ghi chú). Phân tích 2 tầng: cục bộ offline + nút bấm **✨ AI Gemini** (dùng API key miễn phí tự nhập). **100% kín cho Chủ/Phó sân**, thành viên không thấy. |
| **Nhóm 2** | Chế độ Đánh độ (Nước / Cầu / Tiền) + Sổ Nợ Độ | **LÀM ĐỢT 2** | Hỗ trợ cả hiện vật (nước, cầu) và tiền vui, chia theo đầu người hoặc theo đội, trả **Đội thắng** hoặc **Góp Quỹ chung**. Bật/sửa được ngay khi đang đánh trên sân (hiện nhãn `🔥 Kèo độ`) hoặc bổ sung khi kết thúc trận. Cuối buổi có **Sổ Nợ Độ công khai** (tự cấn trừ chéo, tick đã trả, gửi Zalo) + công tắc **Gộp tiền độ vào tổng chuyển khoản** (mặc định TẮT). |
| **Nhóm 3** | Gửi ảnh biên lai chuyển khoản & Duyệt kiểu Alobo | **LÀM ĐỢT 2** | Nén ảnh nhẹ (~70KB) trên máy rồi tải lên Supabase Storage (có sẵn script SQL 1 chạm). Chủ/Phó sân mở ảnh phóng to để **Duyệt ✓** hoặc **Từ chối** kèm lý do nhanh (*Ảnh mờ / Thiếu tiền / Chưa thấy vào*) để thành viên nộp lại. Tự động dọn ảnh cũ khi sang buổi mới; vẫn cho báo không ảnh nếu chưa cấu hình Storage. |
| **Nhóm 4** | Mã VietQR cá nhân hóa theo từng người chơi | **LÀM ĐỢT 2** | Chọn ngân hàng chuẩn VN, tự tạo ảnh VietQR động miễn phí (`img.vietqr.io`) điền sẵn đúng số tiền từng người (Nam/Nữ/giảm giá/gộp độ) và tự gắn tên người chơi vào nội dung chuyển khoản. Hỗ trợ Tải ảnh QR & Sao chép STK 1 chạm. |
| **Nhóm 5** | Quản lý cọc khách vãng lai & hội viên đóng tháng | **BỎ QUA** | Chưa cần trong đợt 2 (để gọn trải nghiệm). |
| **Nhóm 6** | Sổ thành viên kín + Sao kê đa buổi & Xuất Excel | **LÀM ĐỢT 2** | Ghi chú & thẻ kín trên Sổ thành viên CLB (ẩn hoàn toàn với người xem, làm dữ liệu ngữ cảnh cho AI Gemini). Sổ lưu trữ các buổi cũ lưu thêm bản chụp tài chính, cho tick **"Đã trả bù ✅"** nợ buổi trước, thẻ tổng hợp **Quỹ dư tích lũy & Danh sách nợ cũ**, và xuất file **`.csv` (UTF-8 BOM)** mở chuẩn Tiếng Việt trong Excel / Google Sheets. |

---

## Chi Tiết Các Quyết Định Đợt 2

### 1. Nhóm 1 — Đánh giá sau trận & AI (Gemini) phân tích trình độ
- **Luồng ghi nhận sau trận:**
  - Khi bấm kết thúc trận, mở bảng nhận xét nhanh nhỏ gọn với nút **"Bỏ qua (Mặc định đều)"** đặt nổi bật ngay trên cùng (bấm 1 chạm để đi tiếp ngay không bị khựng nhịp điều phối).
  - Có công tắc bật/tắt nhanh chế độ *"Hỏi nhận xét sau trận"* trong Cài đặt (nếu sân quá đông thì tắt tạm; riêng trận có gắn kèo độ vẫn nhắc nhanh chọn đội thắng).
  - Trong tab **Lịch sử**, Chủ/Phó sân có thể bấm sửa/bổ sung tỉ số, đánh giá, nhận xét hoặc kết quả kèo độ bất cứ lúc nào.
- **Nội dung ghi nhận:**
  - **Tỉ số trận** (tùy chọn, VD `21 - 14`) — tự động gợi ý đội thắng kèo độ nếu có.
  - **Độ cân kèo trận** (1 chạm): `Cân hay` / `Chênh nhẹ` / `Chênh quá`. Trận bị gắn `Chênh quá` (hoặc chênh điểm rất sâu) sẽ tạo phạt mềm trong thuật toán xếp sân để hạn chế ghép lặp lại đúng thế trận chênh lệch đó.
  - **Nhận xét riêng từng người trong trận** (chỉ Chủ sân ghi & lưu kín trên máy): `↑ Vượt trình`, `↓ Hơi đuối`, `★ Đánh hay` + ghi chú ngắn tùy chọn.
- **Phân tích trình độ 2 tầng & Bảo mật tâm lý hội nhóm:**
  - **Tầng 1 (Cục bộ — luôn chạy không cần mạng):** Tổng hợp tỉ số + số lần được gắn thẻ vượt trình / hơi đuối để gợi ý nâng/hạ 1 bậc trình độ khi đủ dữ liệu.
  - **Tầng 2 (AI Gemini — chủ động bấm nút):** Chủ sân nhập Gemini API key miễn phí (lưu cục bộ trên trình duyệt giống cấu hình Supabase). Khi bấm **"✨ AI Gemini phân tích trình độ"**, AI đọc lịch sử tỉ số, nhận xét từng người và ghi chú Sổ CLB để phân tích sâu và đề xuất chỉnh bậc trình độ + nhận xét cặp đấu.
  - **Nguyên tắc kín & không tự nhảy trình:** Toàn bộ nhận xét cá nhân, ghi chú Sổ CLB và bảng phân tích AI **ẩn tuyệt đối với Thành viên (VIEWER)** và **không đẩy dữ liệu nhạy cảm cá nhân lên `session_data` công khai**. Khi đồng ý với đề xuất, Chủ sân bấm 1 chạm **"Áp dụng"** để cập nhật trình độ cho cả buổi hiện tại lẫn Sổ thành viên CLB.

### 2. Nhóm 2 — Chế độ Đánh độ (Nước / Cầu / Tiền) & Sổ Nợ Độ
- **Loại kèo & cách thức:**
  - Hỗ trợ cả **Hiện vật** (*1 nước/người, 1 quả cầu/đội, tùy chỉnh...*) và **Tiền vui** (*20k/người, 50k/đội, tùy chỉnh...*), có sẵn các nút chọn nhanh 1 chạm.
  - Hỗ trợ cả 2 hướng trả độ: **Đội thua trả Đội thắng** (`TEAM_TO_TEAM`) và **Đội thua góp Quỹ chung** (`LOSER_TO_FUND`).
- **Thời điểm cài kèo:**
  - Cài/sửa ngay trên thẻ sân khi trận đang diễn ra → hiển thị nhãn nổi bật **`🔥 KÈO ĐỘ: ...`** đồng bộ realtime để cả sân thấy tạo không khí.
  - Hoặc gắn bổ sung / xác nhận đội thắng ngay trong bảng sau trận (hoặc sửa trong Lịch sử).
- **Sổ Nợ Độ cuối buổi & Liên kết bảng tính tiền:**
  - Hiển thị công khai ngay dưới bảng thu tiền sân trong tab **Tính tiền** để cả Chủ sân lẫn Thành viên (VIEWER) mở lên là thấy rõ ai nợ ai (tránh quên sau buổi).
  - Với kèo tiền `Đội thua trả Đội thắng`: tự động **cấn trừ chéo** (tối giản số lượt chuyển khoản, VD A nợ B 20k và B nợ C 20k → chỉ còn A trả C 20k).
  - Với kèo hiện vật (nước/cầu): liệt kê riêng rõ ràng theo từng trận và tổng hợp số lượng mỗi người nợ, không trộn lẫn vào tiền mặt.
  - Mỗi khoản nợ độ đều có nút tick **`✅ Đã trả độ`** đồng bộ Online và xuất kèm vào **Tin nhắn Zalo**.
  - **Công tắc "Gộp tiền độ vào tổng chuyển khoản" (mặc định TẮT):** Khi Chủ sân bật lên, phần tiền độ ròng (tiền thua cộng thêm, tiền thắng trừ bớt, tiền góp quỹ cộng thêm) tự động gộp vào số tiền chuyển khoản & mã VietQR của từng người. Nếu ai thắng độ nhiều hơn tiền sân, hệ thống hiển thị rõ **"Được nhận lại Xđ"** thay vì mã QR thu tiền.

### 3. Nhóm 3 & 4 — VietQR cá nhân hóa + Biên lai chuyển khoản kiểu Alobo
- **VietQR cá nhân hóa (Nhóm 4):**
  - Danh sách ngân hàng chuẩn Việt Nam (Vietcombank, MB, Techcombank, BIDV, VietinBank, ACB, VPBank, TPBank, Sacombank, Agribank, HDBank, VIB, MSB, OCB, SHB, Eximbank, LPBank, SeABank, Cake, Timo...) và tự suy luận mã ngân hàng cho các tên ngân hàng cũ đã lưu trước đó.
  - Bấm vào nút **QR / Chuyển khoản** cạnh tên từng người sẽ mở mã VietQR động điền sẵn chính xác số tiền của riêng người đó + nội dung chuyển khoản không dấu tự gắn tên người chơi (VD `Tien cau long Tuan Anh`), kèm nút **Tải ảnh QR** và **Sao chép STK**.
- **Biên lai chuyển khoản kiểu Alobo (Nhóm 3):**
  - Thành viên chọn ảnh chụp biên lai → ứng dụng tự nén nhẹ trên máy (~70KB, chữ số sắc nét cho mạng 4G) và tải lên kho Supabase Storage (`payment-receipts`).
  - Chủ/Phó sân thấy nhãn **`⏳ Chờ duyệt [Xem ảnh]`**, bấm mở ảnh toàn màn hình để đối chiếu, sau đó bấm **"Duyệt ✓"** hoặc **"Từ chối"** kèm chọn nhanh lý do (*Ảnh mờ / Thiếu tiền / Chưa thấy tiền vào / Lý do khác*).
  - Thành viên bị từ chối thấy ngay lý do màu đỏ và có thể tải lại ảnh mới.
  - Tự động dọn sạch ảnh biên lai cũ của phòng khi bấm **"Buổi mới"** hoặc **"Xóa sạch"** (kèm nút dọn tay khi cần). Nếu phòng chưa cấu hình Storage bucket hoặc thành viên không chọn ảnh, vẫn hoạt động trơn tru bằng nút báo **"Tôi đã chuyển"** không kèm ảnh.

### 4. Nhóm 6 — Sổ thành viên kín & Sao kê tài chính đa buổi / Xuất Excel
- **Ghi chú kín Sổ thành viên CLB:**
  - Cho phép gắn thẻ nhanh (*Trình cứng, Vãng lai, Đau gối/nhẹ tay, Đánh nhiệt, Hay hủy sát giờ*) và ghi chú riêng cho từng thành viên CLB.
  - Ẩn hoàn toàn ở chế độ Thành viên (`VIEWER`), chỉ lưu cục bộ trên máy Chủ sân và được đưa vào làm ngữ cảnh cho AI Gemini phân tích trình độ.
- **Sao kê đa buổi & Xuất Excel (`.csv` UTF-8 BOM):**
  - Khi lưu buổi đánh vào Sổ lưu trữ (thủ công hoặc tự động lúc sang *"Buổi mới"*), lưu kèm bản chụp tài chính đầy đủ (tổng sân/cầu/phụ phí, quỹ dư, quỹ độ, danh sách từng người đóng bao nhiêu & đã đóng hay chưa — không lưu ảnh biên lai nặng).
  - Trong Sổ lưu trữ, Chủ sân có thể xem thẻ **Tổng hợp Quỹ dư tích lũy & Danh sách nợ cũ**, bấm tick **"Đã trả bù ✅"** trực tiếp cho người trả muộn từ các buổi trước.
  - Nút **Xuất Excel (`.csv`)** 1 chạm cho cả buổi hiện tại và sao kê tổng hợp nhiều buổi (có ký tự BOM UTF-8 để Microsoft Excel & Google Sheets mở chuẩn Tiếng Việt có dấu, đồng thời chống lỗi công thức CSV).

