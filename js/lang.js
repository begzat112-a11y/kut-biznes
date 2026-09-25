/* =========================================================
   КУТ: БИЗНЕС — Многоязычность (i18n)
   Языки: Русский (ru) · Кыргызча (kg) · English (en)
   Публичный API: window.KUT_LANG
   Автомонтирование переключателя языка в шапку.
   ========================================================= */

(function () {
  'use strict';

  // =========================================================
  // 1. КОНСТАНТЫ
  // =========================================================
  const STORAGE_KEY = 'kut_lang';
  const DEFAULT_LANG = 'ru';
  const SUPPORTED = ['ru', 'kg', 'en'];

  const FLAGS = { ru: '🇷🇺', kg: '🇰🇬', en: '🇬🇧' };
  const CODES = { ru: 'RU', kg: 'KG', en: 'EN' };
  const NAMES = { ru: 'Русский', kg: 'Кыргызча', en: 'English' };

  // =========================================================
  // 2. СЛОВАРЬ ПЕРЕВОДОВ
  // =========================================================
  const dict = {

    // ================= РУССКИЙ =================
    ru: {
      // Общее
      'common.search': 'Поиск',
      'common.add': 'Добавить',
      'common.edit': 'Редактировать',
      'common.delete': 'Удалить',
      'common.save': 'Сохранить',
      'common.cancel': 'Отмена',
      'common.confirm': 'Подтвердить',
      'common.actions': 'Действия',
      'common.close': 'Закрыть',
      'common.yes': 'Да',
      'common.no': 'Нет',
      'common.name': 'Имя',
      'common.phone': 'Телефон',
      'common.amount': 'Сумма',
      'common.date': 'Дата',
      'common.kgs': 'KGS',
      'common.pcs': 'шт',
      'common.kg': 'кг',
      'common.l': 'л',
      'common.portion': 'порц.',
      'common.service': 'усл.',
      'common.not_found': 'Ничего не найдено',
      'common.out_of_stock': 'Нет в наличии',
      'common.low_stock': 'Мало на складе',

      // Бренд
      'brand.name': 'КУТ: БИЗНЕС',
      'brand.tagline': 'Учёт для малого бизнеса',
      'brand.footer': 'Простая система учёта для малого бизнеса Кыргызстана',

      // Навигация
      'nav.home': 'Главная',
      'nav.cash': 'Касса',
      'nav.stock': 'Склад',
      'nav.debts': 'Несие (долги)',
      'nav.reports': 'Отчёты',

      // Сайдбар / быстрые действия
      'sidebar.open_cash': 'Открыть кассу',
      'sidebar.new_sale': 'Новая продажа',

      // Дашборд
      'dashboard.greeting': 'Здравствуйте! 👋',
      'dashboard.summary': 'Сводка по вашему бизнесу на сегодня',
      'dashboard.updated': 'Обновлено',
      'dashboard.revenue': 'Всего выручка',
      'dashboard.stock_value': 'Стоимость склада',
      'dashboard.debts': 'Нам должны (Несие)',
      'dashboard.no_sales': 'Продаж пока не было',
      'dashboard.sales_meta': 'Продаж: {n} · нал. {cash} · кошелёк {wallet} · несие {debt}',
      'dashboard.stock_meta': 'Позиций: {n} · заканчивается: {low}',
      'dashboard.stock_empty': 'Склад пуст',
      'dashboard.debts_meta': 'Активных должников: {n}',
      'dashboard.debts_empty': 'Активных должников нет',
      'dashboard.recent': 'Последние продажи',
      'dashboard.recent_open': 'Открыть кассу →',
      'dashboard.recent_empty': 'Продаж ещё не было. Начните с кассы.',
      'dashboard.quick_actions': 'Быстрые действия',
      'dashboard.qa_sell': 'Продать товар',
      'dashboard.qa_stock': 'Остатки и цены',
      'dashboard.qa_debts': 'Тетрадь долгов',
      'dashboard.sale_cash': 'Продажа · Наличные',
      'dashboard.sale_wallet': 'Продажа · MBANK / Элсом / О!Деньги',
      'dashboard.sale_debt': 'Продажа · Несие — {name}',
      'dashboard.sale_plain': 'Продажа',
      'dashboard.today': 'сегодня',
      'dashboard.yesterday': 'вчера',
      'dashboard.items_short': '{n} поз.',

      // Касса
      'cash.title': 'Касса',
      'cash.cart': 'Чек',
      'cash.clear': 'Очистить',
      'cash.confirm_clear': 'Очистить чек полностью?',
      'cash.empty_title': 'Чек пуст',
      'cash.empty_hint': 'Нажмите на товар слева, чтобы добавить его',
      'cash.total': 'Итого',
      'cash.checkout': 'Оформить продажу',
      'cash.payment_method': 'Способ оплаты',
      'cash.payment_total': 'Сумма к оплате:',
      'cash.method_cash': 'Наличные',
      'cash.method_wallet': 'MBANK / Элсом / О!Деньги',
      'cash.method_debt': 'В долг (Несие)',
      'cash.customer_name': 'Имя клиента',
      'cash.customer_hint': 'Начните вводить имя — появятся ранее сохранённые должники.',
      'cash.success_title': 'Продажа успешно проведена!',
      'cash.success_sub': 'Чек сохранён. Сумма:',
      'cash.success_ok': 'Отлично',
      'cash.search_placeholder': 'Поиск товара по названию...',
      'cash.stock_left': 'осталось {n} {unit}',
      'cash.stock_none': 'нет в наличии',
      'cash.stock_error': 'Недостаточно товара на складе! Осталось всего {n} {unit}.',
      'cash.stock_empty_product': 'Товар «{name}» закончился на складе.',
      'cash.product_gone': 'Товар «{name}» больше не найден на складе. Каталог обновлён.',
      'cash.kernel_error': 'Ошибка: ядро системы не загружено. Проверьте порядок скриптов.',

      // Склад
      'stock.title': 'Склад и товары',
      'stock.subtitle': 'Учёт остатков, себестоимости и цен продажи — всё в одном месте',
      'stock.add': 'Добавить новый товар',
      'stock.stat_total': 'Всего наименований',
      'stock.stat_cost': 'Склад в закупке',
      'stock.stat_low': 'Заканчивается',
      'stock.search_placeholder': 'Поиск по названию или категории...',
      'stock.col_product': 'Товар',
      'stock.col_category': 'Категория',
      'stock.col_qty': 'Остаток',
      'stock.col_cost': 'Закупка',
      'stock.col_sale': 'Продажа',
      'stock.col_margin': 'Маржа',
      'stock.empty_title': 'Пока ничего нет',
      'stock.empty_text': 'Добавьте первый товар — и он сразу появится здесь.',
      'stock.modal_new': 'Новый товар',
      'stock.modal_edit': 'Редактировать товар',
      'stock.modal_new_sub': 'Заполните данные — они сохранятся в вашем складе.',
      'stock.modal_edit_sub': 'Измените данные и сохраните.',
      'stock.field_name': 'Название товара',
      'stock.field_category': 'Категория',
      'stock.field_unit': 'Единица измерения',
      'stock.field_qty': 'Количество в наличии',
      'stock.field_cost': 'Цена закупки',
      'stock.field_sale': 'Цена продажи',
      'stock.field_name_placeholder': 'Например: Джинсы Турция / Лепёшка',
      'stock.preview_profit': 'Прибыль с единицы',
      'stock.preview_markup': 'Наценка',
      'stock.preview_stock_value': 'Сумма по остатку',
      'stock.btn_add': 'Добавить товар',
      'stock.btn_save': 'Сохранить изменения',
      'stock.delete_title': 'Удалить товар?',
      'stock.delete_text': 'Действие нельзя отменить. История продаж этого товара останется в отчётах.',
      'stock.updated': 'Обновлено',
      'stock.updated_toast': 'Товар «{name}» обновлён',
      'stock.added_toast': 'Товар «{name}» добавлен',
      'stock.deleted_toast': 'Товар «{name}» удалён',
      'stock.remove_confirm': '«{name}» будет удалён со склада.',

      // Долги
      'debts.title': 'Несие — учёт долгов',
      'debts.subtitle': 'Тетрадь долгов в цифре: напоминания в WhatsApp, частичное погашение, архив',
      'debts.add': 'Записать новый долг',
      'debts.stat_total': 'Общая сумма долгов',
      'debts.stat_debtors': 'Должников',
      'debts.stat_overdue': 'Просрочено > 30 дней',
      'debts.tab_active': 'Активные',
      'debts.tab_archive': 'Архив (погашено)',
      'debts.search_placeholder': 'Поиск по имени или номеру телефона...',
      'debts.col_client': 'Клиент',
      'debts.col_phone': 'Телефон',
      'debts.col_amount': 'Сумма долга',
      'debts.col_date': 'Дата',
      'debts.empty_title': 'Пока долгов нет',
      'debts.empty_text': 'Отличная работа — все клиенты расплатились!',
      'debts.empty_archive_title': 'Архив пуст',
      'debts.empty_archive_text': 'Здесь появятся погашенные долги.',
      'debts.modal_new': 'Новый долг',
      'debts.modal_edit': 'Редактировать запись',
      'debts.modal_new_sub': 'Запишите клиента и сумму — потом напомним в WhatsApp в один клик.',
      'debts.modal_edit_sub': 'Обновите данные и сохраните.',
      'debts.field_name': 'Имя клиента',
      'debts.field_name_placeholder': 'Например: Азамат / Гүлнара',
      'debts.field_phone': 'Телефон',
      'debts.field_phone_placeholder': '0700 12 34 56 или +996 700 123 456',
      'debts.field_phone_hint': 'Можно вводить с нуля — код +996 подставится автоматически.',
      'debts.field_amount': 'Сумма долга',
      'debts.field_date': 'Дата взятия',
      'debts.field_due': 'Срок возврата (необязательно)',
      'debts.field_due_hint': 'Если указать — напомним заранее и подсветим просрочку.',
      'debts.field_note': 'Заметка (необязательно)',
      'debts.field_note_placeholder': 'Например: обещал вернуть после зарплаты 10-го',
      'debts.btn_add': 'Записать долг',
      'debts.btn_save': 'Сохранить',
      'debts.pay_title': 'Погашение долга',
      'debts.pay_current': 'Текущий долг',
      'debts.pay_taken': 'Взято',
      'debts.pay_amount': 'Сумма к оплате',
      'debts.pay_full': 'Весь долг',
      'debts.pay_history': 'История платежей',
      'debts.pay_btn': 'Погасить',
      'debts.pay_toast_full': 'Долг «{name}» полностью погашен ✓',
      'debts.pay_toast_partial': 'Принято {paid} KGS. Остаток: {left} KGS',
      'debts.pay_error_max': 'Не может быть больше долга ({n} KGS)',
      'debts.wa_title': 'Напомнить в WhatsApp',
      'debts.wa_client': 'Клиент:',
      'debts.wa_debt': 'Долг:',
      'debts.wa_ru': 'По-русски',
      'debts.wa_kg': 'Кыргызча',
      'debts.delete_title': 'Удалить запись о долге?',
      'debts.delete_text': 'Действие нельзя отменить. Используйте, если запись была создана по ошибке.',
      'debts.delete_confirm': 'Запись о долге «{name}» ({amount}) будет удалена.',
      'debts.deleted_toast': 'Запись «{name}» удалена',
      'debts.saved_toast': 'Долг «{name}» записан',
      'debts.updated_toast': 'Запись «{name}» обновлена',
      'debts.days_ago': '{n} дн. назад',
      'debts.overdue': '⚠ Просрочено {n} дн.',
      'debts.paid_on': 'Погашено {date}',
      'debts.due_until': 'Вернуть до {date} ({n} дн.)',
      'debts.of_initial': 'из {n} KGS',
      'debts.auto_note': 'Автоматически из продажи в кассе',
      'debts.wa_ru_full': 'Салам, {name}!\nНапоминаем о задолженности {amount} сомов{from}.\nПожалуйста, погасите при удобной возможности. Спасибо! 🙏',
      'debts.wa_kg_full': 'Салам, {name}!\n{from}{amount} сом карызыңызды унутпаңыз.\nЫңгайлуу убакытта төлөп берсеңиз. Рахмат! 🙏',
      'debts.wa_from_ru': ' от {date}',
      'debts.wa_from_kg': '{date} күнү алынган ',

      // Способы оплаты (общие)
      'payment.cash': 'Наличные',
      'payment.wallet': 'MBANK / Элсом / О!Деньги',
      'payment.debt': 'В долг (Несие)',

      // Категории товаров
      'category.all': 'Все',
      'category.bakery': 'Выпечка',
      'category.drinks': 'Напитки',
      'category.groceries': 'Продукты',
      'category.household': 'Хозтовары',
      'category.clothing': 'Одежда',
      'category.services': 'Услуги',
      'category.other': 'Другое',

      // Язык
      'lang.label': 'Язык',
    },

    // ================= КЫРГЫЗЧА =================
    kg: {
      'common.search': 'Издөө',
      'common.add': 'Кошуу',
      'common.edit': 'Оңдоо',
      'common.delete': 'Өчүрүү',
      'common.save': 'Сактоо',
      'common.cancel': 'Жокко чыгаруу',
      'common.confirm': 'Тастыктоо',
      'common.actions': 'Аракеттер',
      'common.close': 'Жабуу',
      'common.yes': 'Ооба',
      'common.no': 'Жок',
      'common.name': 'Аты',
      'common.phone': 'Телефон',
      'common.amount': 'Сумма',
      'common.date': 'Күнү',
      'common.kgs': 'KGS',
      'common.pcs': 'даана',
      'common.kg': 'кг',
      'common.l': 'л',
      'common.portion': 'порц.',
      'common.service': 'кызм.',
      'common.not_found': 'Эч нерсе табылган жок',
      'common.out_of_stock': 'Жок',
      'common.low_stock': 'Аз калды',

      'brand.name': 'КУТ: БИЗНЕС',
      'brand.tagline': 'Чакан бизнес үчүн эсеп',
      'brand.footer': 'Кыргызстандын чакан бизнеси үчүн жөнөкөй эсеп системасы',

      'nav.home': 'Башкы бет',
      'nav.cash': 'Касса',
      'nav.stock': 'Склад',
      'nav.debts': 'Несие (карыздар)',
      'nav.reports': 'Отчёттор',

      'sidebar.open_cash': 'Кассаны ачуу',
      'sidebar.new_sale': 'Жаңы сатуу',

      'dashboard.greeting': 'Салам! 👋',
      'dashboard.summary': 'Бүгүнкү бизнесиңиздин көрсөткүчтөрү',
      'dashboard.updated': 'Жаңыртылды',
      'dashboard.revenue': 'Жалпы киреше',
      'dashboard.stock_value': 'Складдын баасы',
      'dashboard.debts': 'Бизге карыз (Несие)',
      'dashboard.no_sales': 'Азырынча сатуу болгон жок',
      'dashboard.sales_meta': 'Сатуулар: {n} · накталай {cash} · капчык {wallet} · несие {debt}',
      'dashboard.stock_meta': 'Позициялар: {n} · бүтүп баратат: {low}',
      'dashboard.stock_empty': 'Склад бош',
      'dashboard.debts_meta': 'Активдүү карыздарлар: {n}',
      'dashboard.debts_empty': 'Активдүү карыздарлар жок',
      'dashboard.recent': 'Акыркы сатуулар',
      'dashboard.recent_open': 'Кассаны ачуу →',
      'dashboard.recent_empty': 'Азырынча сатуу болгон жок. Кассадан баштаңыз.',
      'dashboard.quick_actions': 'Тез аракеттер',
      'dashboard.qa_sell': 'Товар сатуу',
      'dashboard.qa_stock': 'Калдыктар жана баалар',
      'dashboard.qa_debts': 'Карыздар китеби',
      'dashboard.sale_cash': 'Сатуу · Накталай',
      'dashboard.sale_wallet': 'Сатуу · MBANK / Элсом / О!Деньги',
      'dashboard.sale_debt': 'Сатуу · Несие — {name}',
      'dashboard.sale_plain': 'Сатуу',
      'dashboard.today': 'бүгүн',
      'dashboard.yesterday': 'кечээ',
      'dashboard.items_short': '{n} поз.',

      'cash.title': 'Касса',
      'cash.cart': 'Чек',
      'cash.clear': 'Тазалоо',
      'cash.confirm_clear': 'Чекти толук тазалайсызбы?',
      'cash.empty_title': 'Чек бош',
      'cash.empty_hint': 'Товарды кошуу үчүн ага басыңыз',
      'cash.total': 'Жалпы',
      'cash.checkout': 'Сатууну тастыктоо',
      'cash.payment_method': 'Төлөм ыкмасы',
      'cash.payment_total': 'Төлөнүүчү сумма:',
      'cash.method_cash': 'Накталай',
      'cash.method_wallet': 'MBANK / Элсом / О!Деньги',
      'cash.method_debt': 'Карызга (Несие)',
      'cash.customer_name': 'Кардардын аты',
      'cash.customer_hint': 'Атын жаза баштаңыз — мурун сакталган карыздарлар чыгат.',
      'cash.success_title': 'Сатуу ийгиликтүү аяктады!',
      'cash.success_sub': 'Чек сакталды. Сумма:',
      'cash.success_ok': 'Мыкты',
      'cash.search_placeholder': 'Товарды аты боюнча издөө...',
      'cash.stock_left': '{n} {unit} калды',
      'cash.stock_none': 'жок',
      'cash.stock_error': 'Складда товар жетишсиз! Бар болгону {n} {unit} калды.',
      'cash.stock_empty_product': '«{name}» товары складда бүттү.',
      'cash.product_gone': '«{name}» товары складдан табылган жок. Каталог жаңыртылды.',
      'cash.kernel_error': 'Ката: системанын өзөгү жүктөлгөн жок. Скрипттердин тартибин текшериңиз.',

      'stock.title': 'Склад жана товарлар',
      'stock.subtitle': 'Калдыктарды, өздүк наркын жана сатуу бааларын эсепке алуу — баары бир жерде',
      'stock.add': 'Жаңы товар кошуу',
      'stock.stat_total': 'Баарынын саны',
      'stock.stat_cost': 'Склад сатып алууда',
      'stock.stat_low': 'Бүтүп баратат',
      'stock.search_placeholder': 'Аты же категориясы боюнча издөө...',
      'stock.col_product': 'Товар',
      'stock.col_category': 'Категория',
      'stock.col_qty': 'Калдык',
      'stock.col_cost': 'Сатып алуу',
      'stock.col_sale': 'Сатуу',
      'stock.col_margin': 'Маржа',
      'stock.empty_title': 'Азырынча эч нерсе жок',
      'stock.empty_text': 'Биринчи товарды кошуңуз — ал дароо ушул жерде пайда болот.',
      'stock.modal_new': 'Жаңы товар',
      'stock.modal_edit': 'Товарды оңдоо',
      'stock.modal_new_sub': 'Маалыматты толтуруңуз — ал складыңызга сакталат.',
      'stock.modal_edit_sub': 'Маалыматты өзгөртүп, сактаңыз.',
      'stock.field_name': 'Товардын аты',
      'stock.field_category': 'Категория',
      'stock.field_unit': 'Өлчөө бирдиги',
      'stock.field_qty': 'Кампадагы саны',
      'stock.field_cost': 'Сатып алуу баасы',
      'stock.field_sale': 'Сатуу баасы',
      'stock.field_name_placeholder': 'Мисалы: Джинсы Түркия / Нан',
      'stock.preview_profit': 'Бирдиктен пайда',
      'stock.preview_markup': 'Кошумча баа',
      'stock.preview_stock_value': 'Калдык боюнча сумма',
      'stock.btn_add': 'Товар кошуу',
      'stock.btn_save': 'Өзгөртүүлөрдү сактоо',
      'stock.delete_title': 'Товарды өчүрөсүзбү?',
      'stock.delete_text': 'Аракетти артка кайтаруу мүмкүн эмес. Бул товардын сатуу тарыхы отчёттордо калат.',
      'stock.updated': 'Жаңыртылды',
      'stock.updated_toast': '«{name}» товары жаңыртылды',
      'stock.added_toast': '«{name}» товары кошулду',
      'stock.deleted_toast': '«{name}» товары өчүрүлдү',
      'stock.remove_confirm': '«{name}» складдан өчүрүлөт.',

      'debts.title': 'Несие — карыздарды эсепке алуу',
      'debts.subtitle': 'Карыздар китеби санарипте: WhatsApp эскертүүлөрү, бөлүкчөлөп төлөө, архив',
      'debts.add': 'Жаңы карыз жазуу',
      'debts.stat_total': 'Жалпы карыз суммасы',
      'debts.stat_debtors': 'Карыздарлар',
      'debts.stat_overdue': 'Мөөнөтү өткөн > 30 күн',
      'debts.tab_active': 'Активдүү',
      'debts.tab_archive': 'Архив (төлөнгөн)',
      'debts.search_placeholder': 'Аты же телефон номери боюнча издөө...',
      'debts.col_client': 'Кардар',
      'debts.col_phone': 'Телефон',
      'debts.col_amount': 'Карыз суммасы',
      'debts.col_date': 'Күнү',
      'debts.empty_title': 'Азырынча карыз жок',
      'debts.empty_text': 'Мыкты иш — бардык кардарлар төлөштү!',
      'debts.empty_archive_title': 'Архив бош',
      'debts.empty_archive_text': 'Төлөнгөн карыздар ушул жерде пайда болот.',
      'debts.modal_new': 'Жаңы карыз',
      'debts.modal_edit': 'Жазууну оңдоо',
      'debts.modal_new_sub': 'Кардарды жана сумманы жазыңыз — кийин WhatsApp аркылуу бир баскычта эскертебиз.',
      'debts.modal_edit_sub': 'Маалыматты жаңыртып, сактаңыз.',
      'debts.field_name': 'Кардардын аты',
      'debts.field_name_placeholder': 'Мисалы: Азамат / Гүлнара',
      'debts.field_phone': 'Телефон',
      'debts.field_phone_placeholder': '0700 12 34 56 же +996 700 123 456',
      'debts.field_phone_hint': 'Нөлдөн баштап жазсаңыз болот — +996 коду автоматтык түрдө кошулат.',
      'debts.field_amount': 'Карыз суммасы',
      'debts.field_date': 'Алынган күнү',
      'debts.field_due': 'Кайтаруу мөөнөтү (милдеттүү эмес)',
      'debts.field_due_hint': 'Эгер көрсөтсөңүз — алдын ала эскертип, мөөнөтү өткөндөрдү белгилейбиз.',
      'debts.field_note': 'Эскертүү (милдеттүү эмес)',
      'debts.field_note_placeholder': 'Мисалы: айлык алгандан кийин 10-да кайтарамын деди',
      'debts.btn_add': 'Карызды жазуу',
      'debts.btn_save': 'Сактоо',
      'debts.pay_title': 'Карызды төлөө',
      'debts.pay_current': 'Учурдагы карыз',
      'debts.pay_taken': 'Алынган',
      'debts.pay_amount': 'Төлөнүүчү сумма',
      'debts.pay_full': 'Бүт карыз',
      'debts.pay_history': 'Төлөмдөрдүн тарыхы',
      'debts.pay_btn': 'Төлөө',
      'debts.pay_toast_full': '«{name}» карызы толук төлөндү ✓',
      'debts.pay_toast_partial': '{paid} KGS кабыл алынды. Калдык: {left} KGS',
      'debts.pay_error_max': 'Карыздан чоң болушу мүмкүн эмес ({n} KGS)',
      'debts.wa_title': 'WhatsApp аркылуу эскертүү',
      'debts.wa_client': 'Кардар:',
      'debts.wa_debt': 'Карыз:',
      'debts.wa_ru': 'Орусча',
      'debts.wa_kg': 'Кыргызча',
      'debts.delete_title': 'Карыз жазуусун өчүрөсүзбү?',
      'debts.delete_text': 'Аракетти артка кайтаруу мүмкүн эмес. Жазуу ката менен түзүлгөн болсо колдонуңуз.',
      'debts.delete_confirm': '«{name}» ({amount}) карыз жазуусу өчүрүлөт.',
      'debts.deleted_toast': '«{name}» жазуусу өчүрүлдү',
      'debts.saved_toast': '«{name}» карызы жазылды',
      'debts.updated_toast': '«{name}» жазуусу жаңыртылды',
      'debts.days_ago': '{n} күн мурун',
      'debts.overdue': '⚠ {n} күн кечикти',
      'debts.paid_on': '{date} төлөндү',
      'debts.due_until': '{date} чейин кайтаруу ({n} күн)',
      'debts.of_initial': '{n} KGS ичинен',
      'debts.auto_note': 'Кассадагы сатуудан автоматтык түрдө',
      'debts.wa_ru_full': 'Салам, {name}!\n{amount} сом карызыңыз жөнүндө эскертебиз{from}.\nЫңгайлуу убакытта төлөп берсеңиз. Рахмат! 🙏',
      'debts.wa_kg_full': 'Салам, {name}!\n{from}{amount} сом карызыңызды унутпаңыз.\nЫңгайлуу убакытта төлөп берсеңиз. Рахмат! 🙏',
      'debts.wa_from_ru': ' ({date} күнү алынган)',
      'debts.wa_from_kg': '{date} күнү алынган ',

      'payment.cash': 'Накталай',
      'payment.wallet': 'MBANK / Элсом / О!Деньги',
      'payment.debt': 'Карызга (Несие)',

      'category.all': 'Баары',
      'category.bakery': 'Нан азыктары',
      'category.drinks': 'Ичимдиктер',
      'category.groceries': 'Азык-түлүк',
      'category.household': 'Чарбалык товарлар',
      'category.clothing': 'Кийим',
      'category.services': 'Кызматтар',
      'category.other': 'Башка',

      'lang.label': 'Тил',
    },

    // ================= ENGLISH =================
    en: {
      'common.search': 'Search',
      'common.add': 'Add',
      'common.edit': 'Edit',
      'common.delete': 'Delete',
      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'common.confirm': 'Confirm',
      'common.actions': 'Actions',
      'common.close': 'Close',
      'common.yes': 'Yes',
      'common.no': 'No',
      'common.name': 'Name',
      'common.phone': 'Phone',
      'common.amount': 'Amount',
      'common.date': 'Date',
      'common.kgs': 'KGS',
      'common.pcs': 'pcs',
      'common.kg': 'kg',
      'common.l': 'L',
      'common.portion': 'port.',
      'common.service': 'serv.',
      'common.not_found': 'Nothing found',
      'common.out_of_stock': 'Out of stock',
      'common.low_stock': 'Low stock',

      'brand.name': 'KUT: BUSINESS',
      'brand.tagline': 'Accounting for small business',
      'brand.footer': 'Simple accounting system for small business in Kyrgyzstan',

      'nav.home': 'Home',
      'nav.cash': 'Cashier',
      'nav.stock': 'Stock',
      'nav.debts': 'Debts (Nesiye)',
      'nav.reports': 'Reports',

      'sidebar.open_cash': 'Open cashier',
      'sidebar.new_sale': 'New sale',

      'dashboard.greeting': 'Hello! 👋',
      'dashboard.summary': 'Your business summary for today',
      'dashboard.updated': 'Updated',
      'dashboard.revenue': 'Total revenue',
      'dashboard.stock_value': 'Stock value',
      'dashboard.debts': 'Owed to us (Nesiye)',
      'dashboard.no_sales': 'No sales yet',
      'dashboard.sales_meta': 'Sales: {n} · cash {cash} · wallet {wallet} · credit {debt}',
      'dashboard.stock_meta': 'Items: {n} · running low: {low}',
      'dashboard.stock_empty': 'Stock is empty',
      'dashboard.debts_meta': 'Active debtors: {n}',
      'dashboard.debts_empty': 'No active debtors',
      'dashboard.recent': 'Recent sales',
      'dashboard.recent_open': 'Open cashier →',
      'dashboard.recent_empty': 'No sales yet. Start with the cashier.',
      'dashboard.quick_actions': 'Quick actions',
      'dashboard.qa_sell': 'Sell product',
      'dashboard.qa_stock': 'Stock and prices',
      'dashboard.qa_debts': 'Debt book',
      'dashboard.sale_cash': 'Sale · Cash',
      'dashboard.sale_wallet': 'Sale · MBANK / Elsom / O!Money',
      'dashboard.sale_debt': 'Sale · Credit — {name}',
      'dashboard.sale_plain': 'Sale',
      'dashboard.today': 'today',
      'dashboard.yesterday': 'yesterday',
      'dashboard.items_short': '{n} items',

      'cash.title': 'Cashier',
      'cash.cart': 'Cart',
      'cash.clear': 'Clear',
      'cash.confirm_clear': 'Clear the entire cart?',
      'cash.empty_title': 'Cart is empty',
      'cash.empty_hint': 'Tap a product to add it',
      'cash.total': 'Total',
      'cash.checkout': 'Complete sale',
      'cash.payment_method': 'Payment method',
      'cash.payment_total': 'Amount to pay:',
      'cash.method_cash': 'Cash',
      'cash.method_wallet': 'MBANK / Elsom / O!Money',
      'cash.method_debt': 'On credit (Nesiye)',
      'cash.customer_name': 'Customer name',
      'cash.customer_hint': 'Start typing a name — previously saved debtors will appear.',
      'cash.success_title': 'Sale completed successfully!',
      'cash.success_sub': 'Receipt saved. Amount:',
      'cash.success_ok': 'Great',
      'cash.search_placeholder': 'Search product by name...',
      'cash.stock_left': '{n} {unit} left',
      'cash.stock_none': 'out of stock',
      'cash.stock_error': 'Not enough stock! Only {n} {unit} left.',
      'cash.stock_empty_product': 'Product "{name}" is out of stock.',
      'cash.product_gone': 'Product "{name}" no longer exists in stock. Catalog refreshed.',
      'cash.kernel_error': 'Error: system core not loaded. Check script order.',

      'stock.title': 'Stock and products',
      'stock.subtitle': 'Track remainders, cost and sale prices — all in one place',
      'stock.add': 'Add new product',
      'stock.stat_total': 'Total items',
      'stock.stat_cost': 'Stock at cost',
      'stock.stat_low': 'Running low',
      'stock.search_placeholder': 'Search by name or category...',
      'stock.col_product': 'Product',
      'stock.col_category': 'Category',
      'stock.col_qty': 'Remainder',
      'stock.col_cost': 'Cost',
      'stock.col_sale': 'Sale',
      'stock.col_margin': 'Margin',
      'stock.empty_title': 'Nothing here yet',
      'stock.empty_text': 'Add your first product — it will appear here right away.',
      'stock.modal_new': 'New product',
      'stock.modal_edit': 'Edit product',
      'stock.modal_new_sub': 'Fill in the details — they will be saved in your stock.',
      'stock.modal_edit_sub': 'Update the details and save.',
      'stock.field_name': 'Product name',
      'stock.field_category': 'Category',
      'stock.field_unit': 'Unit of measure',
      'stock.field_qty': 'Quantity in stock',
      'stock.field_cost': 'Cost price',
      'stock.field_sale': 'Sale price',
      'stock.field_name_placeholder': 'For example: Turkey jeans / Flatbread',
      'stock.preview_profit': 'Profit per unit',
      'stock.preview_markup': 'Markup',
      'stock.preview_stock_value': 'Value of remainder',
      'stock.btn_add': 'Add product',
      'stock.btn_save': 'Save changes',
      'stock.delete_title': 'Delete product?',
      'stock.delete_text': 'This action cannot be undone. Sale history for this product will remain in reports.',
      'stock.updated': 'Updated',
      'stock.updated_toast': 'Product "{name}" updated',
      'stock.added_toast': 'Product "{name}" added',
      'stock.deleted_toast': 'Product "{name}" deleted',
      'stock.remove_confirm': '"{name}" will be removed from stock.',

      'debts.title': 'Nesiye — debt tracking',
      'debts.subtitle': 'Debt book in digital: WhatsApp reminders, partial payments, archive',
      'debts.add': 'Record new debt',
      'debts.stat_total': 'Total debt amount',
      'debts.stat_debtors': 'Debtors',
      'debts.stat_overdue': 'Overdue > 30 days',
      'debts.tab_active': 'Active',
      'debts.tab_archive': 'Archive (paid)',
      'debts.search_placeholder': 'Search by name or phone number...',
      'debts.col_client': 'Client',
      'debts.col_phone': 'Phone',
      'debts.col_amount': 'Debt amount',
      'debts.col_date': 'Date',
      'debts.empty_title': 'No debts yet',
      'debts.empty_text': 'Great job — all clients have paid!',
      'debts.empty_archive_title': 'Archive is empty',
      'debts.empty_archive_text': 'Paid debts will appear here.',
      'debts.modal_new': 'New debt',
      'debts.modal_edit': 'Edit record',
      'debts.modal_new_sub': 'Record the client and amount — we will remind via WhatsApp in one click.',
      'debts.modal_edit_sub': 'Update the details and save.',
      'debts.field_name': 'Client name',
      'debts.field_name_placeholder': 'For example: Azamat / Gulnara',
      'debts.field_phone': 'Phone',
      'debts.field_phone_placeholder': '0700 12 34 56 or +996 700 123 456',
      'debts.field_phone_hint': 'You can enter starting with zero — the +996 code will be added automatically.',
      'debts.field_amount': 'Debt amount',
      'debts.field_date': 'Date taken',
      'debts.field_due': 'Due date (optional)',
      'debts.field_due_hint': 'If set — we will remind earlier and highlight overdue.',
      'debts.field_note': 'Note (optional)',
      'debts.field_note_placeholder': 'For example: promised to return after the paycheck on the 10th',
      'debts.btn_add': 'Record debt',
      'debts.btn_save': 'Save',
      'debts.pay_title': 'Pay off debt',
      'debts.pay_current': 'Current debt',
      'debts.pay_taken': 'Taken',
      'debts.pay_amount': 'Amount to pay',
      'debts.pay_full': 'Full debt',
      'debts.pay_history': 'Payment history',
      'debts.pay_btn': 'Pay off',
      'debts.pay_toast_full': 'Debt of "{name}" fully paid ✓',
      'debts.pay_toast_partial': 'Received {paid} KGS. Remaining: {left} KGS',
      'debts.pay_error_max': 'Cannot exceed the debt ({n} KGS)',
      'debts.wa_title': 'Remind via WhatsApp',
      'debts.wa_client': 'Client:',
      'debts.wa_debt': 'Debt:',
      'debts.wa_ru': 'In Russian',
      'debts.wa_kg': 'In Kyrgyz',
      'debts.delete_title': 'Delete debt record?',
      'debts.delete_text': 'This action cannot be undone. Use it if the record was created by mistake.',
      'debts.delete_confirm': 'Debt record for "{name}" ({amount}) will be deleted.',
      'debts.deleted_toast': 'Record for "{name}" deleted',
      'debts.saved_toast': 'Debt for "{name}" recorded',
      'debts.updated_toast': 'Record for "{name}" updated',
      'debts.days_ago': '{n} days ago',
      'debts.overdue': '⚠ Overdue by {n} days',
      'debts.paid_on': 'Paid {date}',
      'debts.due_until': 'Due before {date} ({n} days)',
      'debts.of_initial': 'of {n} KGS',
      'debts.auto_note': 'Auto-created from a sale at the cashier',
      'debts.wa_ru_full': 'Hello, {name}!\nWe would like to remind you about the debt of {amount} KGS{from}.\nPlease pay at your earliest convenience. Thank you! 🙏',
      'debts.wa_kg_full': 'Салам, {name}!\n{from}{amount} сом карызыңызды унутпаңыз.\nЫңгайлуу убакытта төлөп берсеңиз. Рахмат! 🙏',
      'debts.wa_from_ru': ' from {date}',
      'debts.wa_from_kg': '{date} күнү алынган ',

      'payment.cash': 'Cash',
      'payment.wallet': 'MBANK / Elsom / O!Money',
      'payment.debt': 'On credit (Nesiye)',

      'category.all': 'All',
      'category.bakery': 'Bakery',
      'category.drinks': 'Drinks',
      'category.groceries': 'Groceries',
      'category.household': 'Household',
      'category.clothing': 'Clothing',
      'category.services': 'Services',
      'category.other': 'Other',

      'lang.label': 'Language',
    },
  };

  // =========================================================
  // 3. КАРТА ТОВАРОВ: переводы названий
  // Ключи — канонические названия, хранящиеся в localStorage
  // =========================================================
  const PRODUCT_MAP = {
    'Лепёшка':                { ru: 'Лепёшка',              kg: 'Нан',                  en: 'Flatbread' },
    'Боорсок (порция)':       { ru: 'Боорсок (порция)',     kg: 'Боорсок (порция)',     en: 'Boorsok (portion)' },
    'Самса':                  { ru: 'Самса',                kg: 'Самса',                en: 'Samsa' },
    'Хлеб булка':             { ru: 'Хлеб булка',           kg: 'Булка',                en: 'Bread roll' },
    'Чай чёрный (пачка)':     { ru: 'Чай чёрный (пачка)',   kg: 'Кара чай (таңгак)',    en: 'Black tea (pack)' },
    'Вода 1,5 л':             { ru: 'Вода 1,5 л',           kg: 'Суу 1,5 л',            en: 'Water 1.5L' },
    'Кола 1 л':               { ru: 'Кола 1 л',             kg: 'Кола 1 л',             en: 'Cola 1L' },
    'Сок 1 л':                { ru: 'Сок 1 л',              kg: 'Шире 1 л',             en: 'Juice 1L' },
    'Молоко 1 л':             { ru: 'Молоко 1 л',           kg: 'Сүт 1 л',              en: 'Milk 1L' },
    'Яйца (10 шт)':           { ru: 'Яйца (10 шт)',         kg: 'Жумуртка (10 даана)',  en: 'Eggs (10 pcs)' },
    'Рис 1 кг':               { ru: 'Рис 1 кг',             kg: 'Күрүч 1 кг',           en: 'Rice 1 kg' },
    'Сахар 1 кг':             { ru: 'Сахар 1 кг',           kg: 'Кант 1 кг',            en: 'Sugar 1 kg' },
    'Масло растительное 1 л': { ru: 'Масло растительное 1 л', kg: 'Өсүмдүк майы 1 л',   en: 'Vegetable oil 1L' },
    'Макароны':               { ru: 'Макароны',             kg: 'Макарон',              en: 'Pasta' },
    'Мыло':                   { ru: 'Мыло',                 kg: 'Самын',                en: 'Soap' },
    'Стир. порошок':          { ru: 'Стир. порошок',        kg: 'Кир жуучу порошок',    en: 'Laundry detergent' },
    'Стиральный порошок':     { ru: 'Стиральный порошок',   kg: 'Кир жуучу порошок',    en: 'Laundry detergent' },
    'Салфетки':               { ru: 'Салфетки',             kg: 'Салфеткалар',          en: 'Napkins' },
    'Пакет':                  { ru: 'Пакет',                kg: 'Пакет',                en: 'Bag' },
    'Джинсы Турция':          { ru: 'Джинсы Турция',        kg: 'Джинсы Түркия',        en: 'Turkey jeans' },
    'Свитер мужской':         { ru: 'Свитер мужской',       kg: 'Эркек свитер',         en: "Men's sweater" },
    'Футболка базовая':       { ru: 'Футболка базовая',     kg: 'Негизги футболка',     en: 'Basic T-shirt' },
    'Стрижка мужская':        { ru: 'Стрижка мужская',      kg: 'Эркек чач кыркуу',     en: "Men's haircut" },
  };

  // Карта категорий: канонические → ключ словаря
  const CATEGORY_KEY = {
    'Все':       'category.all',
    'Выпечка':   'category.bakery',
    'Напитки':   'category.drinks',
    'Продукты':  'category.groceries',
    'Хозтовары': 'category.household',
    'Одежда':    'category.clothing',
    'Услуги':    'category.services',
    'Другое':    'category.other',
    'Баары':       'category.all',
    'Ичимдиктер':  'category.drinks',
    'Азык-түлүк':  'category.groceries',
    'Чарбалык товарлар': 'category.household',
    'Кийим':       'category.clothing',
    'Кызматтар':   'category.services',
    'Башка':       'category.other',
    'All':         'category.all',
    'Bakery':      'category.bakery',
    'Drinks':      'category.drinks',
    'Groceries':   'category.groceries',
    'Household':   'category.household',
    'Clothing':    'category.clothing',
    'Services':    'category.services',
    'Other':       'category.other',
  };

  // =========================================================
  // 4. ЯДРО
  // =========================================================
  let current = DEFAULT_LANG;

  function detectInitial() {
    // 1) Сохранённый выбор
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED.includes(saved)) return saved;
    } catch (_) {}
    // 2) Язык браузера
    const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (nav.startsWith('ky') || nav.startsWith('kg')) return 'kg';
    if (nav.startsWith('ru')) return 'ru';
    if (nav.startsWith('en')) return 'en';
    // 3) По умолчанию — русский
    return DEFAULT_LANG;
  }

  /** Получить перевод по ключу с подстановкой параметров {name} */
  function t(key, params) {
    const value = (dict[current] && dict[current][key]) ||
                  (dict[DEFAULT_LANG] && dict[DEFAULT_LANG][key]) ||
                  key;
    if (!params) return value;
    return String(value).replace(/\{(\w+)\}/g, (_, k) =>
      params[k] !== undefined ? params[k] : '{' + k + '}'
    );
  }

  /** Перевод названия товара по каноническому названию */
  function tProduct(canonicalName) {
    if (!canonicalName) return '';
    const entry = PRODUCT_MAP[canonicalName];
    if (!entry) return canonicalName;
    return entry[current] || entry[DEFAULT_LANG] || canonicalName;
  }

  /** Перевод названия категории (принимает каноническое или уже переведённое) */
  function tCategory(name) {
    if (!name) return '';
    const key = CATEGORY_KEY[name];
    return key ? t(key) : name;
  }

  // ---------- Применение переводов к DOM ----------
  function applyToDOM(root) {
    const scope = root || document;

    // textContent
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const params = parseParams(el);
      el.textContent = t(key, params);
    });

    // placeholder
    scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });

    // title
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });

    // aria-label
    scope.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });

    // HTML (если нужно вставить <strong> и т.п.)
    scope.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });

    // <html lang="...">
    document.documentElement.lang = current;
  }

  function parseParams(el) {
    const raw = el.getAttribute('data-i18n-params');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  // ---------- Смена языка ----------
  function setLang(lang) {
    if (!SUPPORTED.includes(lang)) return;
    current = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}

    applyToDOM();
    updateSwitcherUI();

    // Оповещаем модули — они могут перерисовать динамический контент
    window.dispatchEvent(new CustomEvent('kut:lang', { detail: { lang } }));
  }

  function getLang() { return current; }

  // =========================================================
  // 5. ПЕРЕКЛЮЧАТЕЛЬ ЯЗЫКА В ШАПКЕ
  // =========================================================
  let switcherEl = null;

  function injectStyles() {
    if (document.getElementById('kut-lang-styles')) return;
    const style = document.createElement('style');
    style.id = 'kut-lang-styles';
    style.textContent = `
      .kut-lang {
        position: relative;
        flex-shrink: 0;
        font-family: 'Inter', system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      .kut-lang__btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 10px;
        background: rgba(255,255,255,.14);
        border: 1px solid rgba(255,255,255,.20);
        border-radius: 10px;
        color: #fff;
        cursor: pointer;
        font-family: inherit;
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        transition: background .18s ease, border-color .18s ease;
        -webkit-tap-highlight-color: transparent;
      }
      .kut-lang__btn:hover { background: rgba(255,255,255,.24); border-color: rgba(255,255,255,.32); }
      .kut-lang__flag { font-size: 15px; line-height: 1; }
      .kut-lang__code { letter-spacing: .5px; }
      .kut-lang__caret {
        font-size: 8px;
        opacity: .8;
        transition: transform .18s ease;
      }
      .kut-lang.is-open .kut-lang__caret { transform: rotate(180deg); }

      .kut-lang__menu {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        background: #fff;
        border: 1px solid #E3EAE6;
        border-radius: 14px;
        box-shadow: 0 18px 48px rgba(16,32,25,.22);
        padding: 6px;
        margin: 0;
        list-style: none;
        min-width: 180px;
        z-index: 200;
        animation: kutLangPop .16s ease;
      }
      .kut-lang__menu[hidden] { display: none; }
      .kut-lang__menu li button {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border: none;
        background: transparent;
        border-radius: 9px;
        font-family: inherit;
        font-size: 14px;
        font-weight: 500;
        color: #14211C;
        cursor: pointer;
        text-align: left;
        transition: background .15s ease, color .15s ease;
        -webkit-tap-highlight-color: transparent;
      }
      .kut-lang__menu li button:hover { background: #E6F1ED; }
      .kut-lang__menu li button.is-active {
        background: #E6F1ED;
        color: #005F40;
        font-weight: 700;
      }
      .kut-lang__menu li button .kut-lang__name { flex: 1; }
      .kut-lang__menu li button .kut-lang__tick { font-size: 12px; color: #005F40; }

      @keyframes kutLangPop {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @media (max-width: 420px) {
        .kut-lang__name-inline { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function buildSwitcher() {
    const wrap = document.createElement('div');
    wrap.className = 'kut-lang';
    wrap.setAttribute('aria-label', t('lang.label'));
    wrap.innerHTML = `
      <button class="kut-lang__btn" type="button" aria-haspopup="listbox" aria-expanded="false">
        <span class="kut-lang__flag" aria-hidden="true">${FLAGS[current]}</span>
        <span class="kut-lang__code">${CODES[current]}</span>
        <span class="kut-lang__caret" aria-hidden="true">▾</span>
      </button>
      <ul class="kut-lang__menu" role="listbox" hidden>
        ${SUPPORTED.map((lg) => `
          <li>
            <button type="button" role="option" data-lang="${lg}" class="${lg === current ? 'is-active' : ''}">
              <span aria-hidden="true">${FLAGS[lg]}</span>
              <span class="kut-lang__name">${NAMES[lg]}</span>
              <span class="kut-lang__tick" aria-hidden="true">${lg === current ? '✓' : ''}</span>
            </button>
          </li>
        `).join('')}
      </ul>
    `;
    return wrap;
  }

  function updateSwitcherUI() {
    if (!switcherEl) return;
    const flagEl = switcherEl.querySelector('.kut-lang__flag');
    const codeEl = switcherEl.querySelector('.kut-lang__code');
    if (flagEl) flagEl.textContent = FLAGS[current];
    if (codeEl) codeEl.textContent = CODES[current];
    switcherEl.querySelectorAll('.kut-lang__menu [data-lang]').forEach((btn) => {
      const active = btn.dataset.lang === current;
      btn.classList.toggle('is-active', active);
      const tick = btn.querySelector('.kut-lang__tick');
      if (tick) tick.textContent = active ? '✓' : '';
    });
  }

  function mountSwitcher() {
    // Куда монтировать: ищем .topbar__inner, .mobile-bar или [data-kut-lang]
    const target = document.querySelector('[data-kut-lang]') ||
                   document.querySelector('.topbar__inner') ||
                   document.querySelector('.mobile-bar');
    if (!target) return;

    switcherEl = buildSwitcher();
    target.appendChild(switcherEl);

    const btn = switcherEl.querySelector('.kut-lang__btn');
    const menu = switcherEl.querySelector('.kut-lang__menu');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !menu.hidden;
      menu.hidden = isOpen;
      switcherEl.classList.toggle('is-open', !isOpen);
      btn.setAttribute('aria-expanded', String(!isOpen));
    });

    menu.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-lang]');
      if (!opt) return;
      setLang(opt.dataset.lang);
      menu.hidden = true;
      switcherEl.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    });

    document.addEventListener('click', (e) => {
      if (!switcherEl.contains(e.target)) {
        menu.hidden = true;
        switcherEl.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) {
        menu.hidden = true;
        switcherEl.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // =========================================================
  // 6. ПУБЛИЧНЫЙ API
  // =========================================================
  window.KUT_LANG = {
    t,
    tProduct,
    tCategory,
    setLang,
    getLang,
    applyToDOM,
    supported: SUPPORTED,
    flags: FLAGS,
    names: NAMES,
    dict,
  };

  // =========================================================
  // 7. СТАРТ
  // =========================================================
  function boot() {
    current = detectInitial();
    injectStyles();
    applyToDOM();
    mountSwitcher();

    // Событие для модулей, чтобы они могли перерисовать контент при первом старте
    window.dispatchEvent(new CustomEvent('kut:lang', { detail: { lang: current } }));

    console.info(
      '%cКУТ i18n загружен · язык: ' + current.toUpperCase(),
      'color:#005F40; font-weight:700'
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

/* =========================================================
   КУТ i18n — ФИНАЛЬНЫЙ АКТИВАТОР ПЕРЕКЛЮЧАТЕЛЯ ЯЗЫКА
   Патч-страховка: делегирование событий на document,
   чтобы клики по KG/RU/EN работали всегда — даже если
   основная часть lang.js не успела привязать обработчики.
   ========================================================= */
(function () {
  'use strict';

  // ---------- Константы ----------
  const STORAGE_KEY = 'kut_lang';
  const SUPPORTED = ['ru', 'kg', 'en'];
  const DEFAULT_LANG = 'ru';
  const FLAGS = { ru: '🇷🇺', kg: '🇰🇬', en: '🇬🇧' };
  const CODES = { ru: 'RU', kg: 'KG', en: 'EN' };

  // Защита от двойной инициализации
  if (window.__kutLangActivatorAttached) return;
  window.__kutLangActivatorAttached = true;

  // ---------- Работа с localStorage ----------
  function readSaved() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return (v && SUPPORTED.includes(v)) ? v : null;
    } catch (_) { return null; }
  }

  function saveLang(lang) {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
  }

  // ---------- Применение языка ----------
  function applyLang(lang) {
    if (!SUPPORTED.includes(lang)) lang = DEFAULT_LANG;

    // 1) Сохраняем выбор
    saveLang(lang);

    // 2) Запускаем перевод через API ядра, если он есть
    if (window.KUT_LANG && typeof window.KUT_LANG.setLang === 'function') {
      window.KUT_LANG.setLang(lang);
    } else {
      // Фоллбэк: как минимум корректный <html lang="...">
      document.documentElement.lang = lang;
      // Ручной проход по data-i18n, если ядро по какой-то причине недоступно
      document.querySelectorAll('[data-i18n]').forEach(function (el) {
        const key = el.getAttribute('data-i18n');
        // Нет словаря — не подменяем, просто оставляем как есть
        void key;
      });
    }

    // 3) Обновляем визуал кнопки в шапке
    updateSwitcherVisual(lang);

    // 4) Оповещаем модули (app.js, cash.js, stock.js, debts.js)
    window.dispatchEvent(new CustomEvent('kut:lang', { detail: { lang: lang } }));

    console.info('[KUT i18n] Язык переключён на:', lang.toUpperCase());
  }

  // ---------- Обновление флага и галочек ----------
  function updateSwitcherVisual(lang) {
    // Флаг + код в кнопке-триггере
    document.querySelectorAll('.kut-lang__btn').forEach(function (btn) {
      const flagEl = btn.querySelector('.kut-lang__flag');
      const codeEl = btn.querySelector('.kut-lang__code');
      if (flagEl) flagEl.textContent = FLAGS[lang] || '';
      if (codeEl) codeEl.textContent = CODES[lang] || '';
      btn.setAttribute('aria-expanded', 'false');
    });

    // Галочки в выпадающем меню
    document.querySelectorAll('.kut-lang__menu [data-lang]').forEach(function (opt) {
      const isActive = opt.dataset.lang === lang;
      opt.classList.toggle('is-active', isActive);
      const tick = opt.querySelector('.kut-lang__tick');
      if (tick) tick.textContent = isActive ? '✓' : '';
    });
  }

  // ---------- Закрытие всех меню ----------
  function closeAllMenus() {
    document.querySelectorAll('.kut-lang__menu').forEach(function (m) {
      m.hidden = true;
    });
    document.querySelectorAll('.kut-lang').forEach(function (w) {
      w.classList.remove('is-open');
      const b = w.querySelector('.kut-lang__btn');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  }

  // ---------- Делегированный обработчик КЛИКА ----------
  document.addEventListener('click', function (e) {
    // 1) Клик по пункту меню (KG / RU / EN)
    const option = e.target.closest('.kut-lang__menu [data-lang]');
    if (option) {
      e.preventDefault();
      e.stopPropagation();
      const lang = option.getAttribute('data-lang');
      applyLang(lang);
      closeAllMenus();
      return;
    }

    // 2) Клик по кнопке-триггеру (открыть/закрыть меню)
    const trigger = e.target.closest('.kut-lang__btn');
    if (trigger) {
      e.preventDefault();
      e.stopPropagation();
      const wrap = trigger.closest('.kut-lang');
      if (!wrap) return;
      const menu = wrap.querySelector('.kut-lang__menu');
      if (!menu) return;
      const willOpen = menu.hidden;
      // Сначала закроем все остальные
      closeAllMenus();
      // Затем откроем нужное
      if (willOpen) {
        menu.hidden = false;
        wrap.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
      }
      return;
    }

    // 3) Клик мимо — всё закрываем
    if (!e.target.closest('.kut-lang')) {
      closeAllMenus();
    }
  }, true); // ← фаза перехвата (capture), чтобы опередить любые stopPropagation

  // ---------- Escape закрывает меню ----------
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAllMenus();
  });

  // ---------- Резерв: <select> вместо кнопок ----------
  document.querySelectorAll('select[data-kut-lang], select#kut-lang, select.kut-lang-select').forEach(function (sel) {
    sel.addEventListener('change', function (e) {
      applyLang(e.target.value);
    });
  });

  // ---------- Стартовое применение ----------
  function boot() {
    const saved = readSaved();

    if (saved) {
      // У пользователя уже сохранён выбор — применяем сразу.
      // setLang у ядра сам запишет в localStorage (перезапись тем же значением безвредна).
      applyLang(saved);
    } else {
      // Первый заход — берём текущий язык ядра (по умолчанию ru) и обновляем только визуал.
      const current = (window.KUT_LANG && window.KUT_LANG.getLang && window.KUT_LANG.getLang()) || DEFAULT_LANG;
      updateSwitcherVisual(current);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Экспорт для отладки из консоли
  window.KUT_LANG_CTRL = {
    apply: applyLang,
    saved: readSaved,
    refresh: updateSwitcherVisual
  };

  console.info(
    '%cКУТ i18n: активатор переключателя подключён',
    'color:#005F40; font-weight:700'
  );
})();
