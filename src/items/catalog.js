// 物件库目录（纯数据，不依赖 three.js；tools/make-catalog.mjs 也读它来生成 data/catalog.json 和说明文档）
//
// kind（大小分类）决定能放进哪种位置点：
//   小件 —— 桌面、架子、抽屉、地上都能放
//   大件 —— 只能放在「地上」类的位置点
//   挂件 —— 只能放在挂钩、晾衣竿、墙面这类位置点
//   被褥 / 固定 —— 有自己专属的位置点，只能改状态，不能挪
// auto：支持状态「自动」= 跟着时间段自己变（写明的状态会覆盖自动）
// text：可以在 items.json 里加一个 text 字段，写在物件上显示出来（纸条、标签、日志）

export const KINDS = {
  小件: '桌面、架子、抽屉、地上都能放',
  大件: '只能放在「地上」类的位置点',
  挂件: '只能放在挂钩、晾衣竿、墙面这类位置点',
  被褥: '每人一套，只能在自己的被褥位置点，只改状态',
  固定: '房子里固定的设施，只能在它专属的位置点，只改状态',
};

export const MODELS = [
  // ———— 花 ————
  { id: 'vase', name: '小花瓶', kind: '小件', states: ['黄色野菊', '野花', '红叶', '空'], desc: '一只细口小白瓷瓶，插几枝花。' },
  { id: 'ikebana', name: '插花（大花器）', kind: '小件', states: ['红叶芒草', '芒草', '空'], desc: '褐色陶花器，插着芒草和红叶枝，适合放在花台、床之间。' },

  // ———— 书和纸 ————
  { id: 'book', name: '一本书', kind: '小件', states: ['合着', '摊开'], desc: '普通大小的书。' },
  { id: 'book-thick', name: '一本厚书', kind: '小件', states: ['合着', '摊开'], desc: '很厚的一本旧书，深红色布面。' },
  { id: 'book-stack', name: '一摞书', kind: '小件', states: ['整齐', '歪着'], desc: '四五本书叠成一摞。' },
  { id: 'library-books', name: '图书馆借的书', kind: '小件', states: ['三本'], desc: '三本书叠着，最上面夹着写还书日期的小纸条。' },
  { id: 'books-bundled', name: '麻绳捆好的旧书报', kind: '大件', states: ['捆好了'], desc: '旧书和旧报纸叠成一摞，用麻绳十字捆好。' },
  { id: 'newspaper', name: '一叠报纸', kind: '小件', states: ['叠好', '摊开'], desc: '镇上的报纸。' },
  { id: 'note', name: '纸条', kind: ['小件', '挂件'], states: ['平放', '折起来'], text: '纸条上写的字（最多三行，每行十个字以内，用 \\n 换行）', desc: '一张手写的小纸条。挂件位置上会贴在墙上。' },
  { id: 'recipe-page', name: '抄着点心方子的纸', kind: '小件', states: ['被厚书压着', '摊开'], text: '方子的标题（例如「栗子羊羹」）', desc: '一页抄着点心方子的纸；「被厚书压着」时上面压着一本厚书。' },
  { id: 'letter', name: '一封信', kind: '小件', states: ['封着', '拆开了'], text: '信封上写的字', desc: '白信封，拆开了就露出信纸。' },
  { id: 'journal-old', name: '写满的旧日志本', kind: '小件', states: ['合着'], desc: '亚托莉写满的旧日志本，纸页鼓起来，夹着便签。' },
  { id: 'journal-new', name: '浅蓝边的新日志本', kind: '小件', states: ['摊开', '合着'], text: '摊开那页写的字（第一行当日期，最多四行）', desc: '亚托莉现在用的日志本，摊开时能看见那一页的字，笔搁在本子上。' },

  // ———— 包裹、箱子 ————
  { id: 'cardboard-box', name: '纸箱', kind: '大件', states: ['封着', '打开', '空'], text: '箱子侧面写的字', desc: '旧纸箱，封着胶带；打开时露出里面的杂物。' },
  { id: 'furoshiki', name: '包袱', kind: '小件', states: ['系着', '解开'], desc: '用包袱布包起来的一包东西。' },
  { id: 'parcel-tagged', name: '贴着手写标签的旧物包裹', kind: '大件', states: ['包着'], text: '标签上写的字', desc: '用旧布包好、麻绳捆着的一包旧物，上面贴着手写标签。' },
  { id: 'paper-bag', name: '纸袋', kind: '小件', states: ['装着东西', '空'], desc: '从镇上买东西装回来的牛皮纸袋。' },
  { id: 'sorting-pile', name: '一堆待整理的旧物', kind: '大件', states: ['留着', '要晒', '要扔'], desc: '旧书、旧布、小杂物堆成一堆，前面插着写了「留着 / 要晒 / 要扔」的纸牌（随状态变）。' },
  { id: 'old-books-airing', name: '摊开晾的旧书', kind: '大件', states: ['摊开晾着', '收起来'], desc: '一本本摊开、书页朝上晾着的旧书；收起来就是叠成一摞。' },
  { id: 'old-quilt-airing', name: '摊开晾的旧被', kind: '大件', states: ['摊开晾着', '叠起来'], desc: '一床发旧的被子摊在地上晒；叠起来就是叠好的一摞。' },

  // ———— 吃的、餐具 ————
  { id: 'bowls-chopsticks', name: '一副碗筷', kind: '小件', states: ['摆好', '吃完了'], desc: '饭碗、汤碗、筷子和筷架。吃完了就是空碗和放下的筷子。' },
  { id: 'tea-set', name: '茶具', kind: '小件', states: ['两只杯子', '三只杯子', '只有茶壶'], desc: '一把茶壶和几只茶杯。' },
  { id: 'teacup', name: '一只茶杯', kind: '小件', states: ['有茶', '空'], desc: '' },
  { id: 'dish-stack', name: '一摞碗盘', kind: '小件', states: ['干净', '没洗'], desc: '叠在一起的碗和盘子。' },
  { id: 'covered-plate', name: '布盖着的点心盘', kind: '小件', states: ['盖着布', '掀开了', '空盘'], desc: '一盘点心，上面盖着一块素布；掀开了能看见里面的团子和栗子饼。' },
  { id: 'fruit-plate', name: '一盘水果', kind: '小件', states: ['柿子', '橘子', '空盘'], desc: '木盘子装着水果。' },
  { id: 'basket', name: '竹篮', kind: '小件', states: ['空', '柿子', '橘子', '栗子', '蔬菜'], desc: '圆竹篮，装着当季的东西。' },
  { id: 'chestnut-bag', name: '一小袋栗子', kind: '小件', states: ['满的', '剩一点'], desc: '纸袋装的栗子。' },
  { id: 'yokan', name: '栗子羊羹', kind: '小件', states: ['整块', '切开了', '只剩一块', '吃完了'], desc: '木盒里的栗子羊羹，切开时旁边小碟上单放一块，压着「主人的份」字条。' },
  { id: 'steamer', name: '竹蒸笼', kind: '小件', states: ['蒸着团子', '掀开了', '空着'], desc: '两层竹蒸笼，蒸着南瓜红豆团子时会冒热气。' },
  { id: 'dough', name: '面团', kind: '小件', states: ['醒着', '擀开了'], desc: '揉面板上的面团，旁边是擀面杖和面粉。' },
  { id: 'sugar-salt-jars', name: '糖罐和盐罐', kind: '小件', states: ['摆着'], desc: '两个一模一样的白瓷罐，贴着「砂糖」「塩」，盐罐的标签贴歪了一点。' },
  { id: 'dish-rack', name: '沥碗架', kind: '小件', states: ['有碗', '空'], desc: '不锈钢沥碗架，倒扣着洗好的碗。' },
  { id: 'kettle', name: '铁壶', kind: '小件', states: ['冒着热气', '凉了'], desc: '黑铁壶。' },

  // ———— 布、衣物、晾晒 ————
  { id: 'zabuton', name: '坐垫', kind: '大件', states: ['摆着', '两个叠着'], desc: '方形坐垫。' },
  { id: 'towels-folded', name: '叠好的浴巾', kind: '小件', states: ['三条', '两条', '一条'], desc: '叠得方方正正的浴巾。' },
  { id: 'leg-wraps', name: '绑腿', kind: '小件', states: ['卷好', '摊开'], desc: '丛雨的白布绑腿，卷好时旁边压着一根红绳。' },
  { id: 'hooks-row', name: '一排挂钩', kind: '挂件', states: ['空着', '挂着毛巾', '挂着布包'], desc: '钉在木条上的一排五个铜挂钩，是新钉的。' },
  { id: 'laundry-towel', name: '晾着的毛巾', kind: '挂件', states: ['自动', '晾着'], auto: '晚上自己收起来（看不见），其他时间晾着', desc: '两条晾在竿子上的毛巾，会随风轻轻晃。' },
  { id: 'laundry-clothes', name: '晾着的衣服', kind: '挂件', states: ['自动', '衬衫', '浴衣', '手帕袜子'], auto: '晚上自己收起来，其他时间晾着衬衫', desc: '晾在竿子上的衣服。' },
  { id: 'laundry-quilt', name: '晒着的被子', kind: '挂件', states: ['自动', '晒着'], auto: '晚上自己收起来，其他时间晒着', desc: '搭在竿子上晒的一床被子，很宽。' },

  // ———— 鞋、伞 ————
  { id: 'shoes-loafer', name: '棕色小皮鞋', kind: '小件', states: ['摆整齐', '随便放'], desc: '亚托莉的棕色小皮鞋。' },
  { id: 'zori', name: '红带草履', kind: '小件', states: ['摆整齐', '随便放'], desc: '小小的红带草履，丛雨的。' },
  { id: 'slippers', name: '拖鞋', kind: '小件', states: ['摆整齐', '随便放'], desc: '室内拖鞋，鞋尖朝屋里摆。' },
  { id: 'geta', name: '木屐', kind: '小件', states: ['摆整齐', '随便放'], desc: '' },
  { id: 'umbrella', name: '红色油纸伞', kind: '大件', states: ['收着', '撑开晾着'], desc: '收着时竖着放；撑开晾着时很占地方。' },

  // ———— 玩具、小摆设 ————
  { id: 'toy-windup', name: '旧发条小玩具', kind: '小件', states: ['停着', '上了发条'], desc: '一只铁皮发条小鸟，漆掉了一些；上了发条会一跳一跳、钥匙在转。' },
  { id: 'daruma', name: '达摩', kind: '小件', states: ['没画眼睛', '画了一只眼', '两只眼都画了'], desc: '红色小达摩。' },
  { id: 'paper-crane', name: '纸鹤', kind: '小件', states: ['一只', '三只'], desc: '彩纸折的纸鹤。' },
  { id: 'koma', name: '陀螺', kind: '小件', states: ['放着', '转着'], desc: '木头陀螺，转着的时候真的会转。' },
  { id: 'uchiwa', name: '团扇', kind: '小件', states: ['放着'], desc: '竹骨纸面的团扇，画着金鱼。' },
  { id: 'photo-frame', name: '相框', kind: '小件', states: ['立着'], desc: '旧木框用砂纸磨过，铜挂钩，素色布衬，立在桌上。' },
  { id: 'half-frame', name: '半成的木框', kind: '小件', states: ['没做完', '做好了'], desc: '一个手做的小木框，没做完时一边还没钉上、旁边有砂纸屑；做好了是完整的框。' },
  { id: 'pocket-watch', name: '旧怀表', kind: '小件', states: ['打开', '合上'], desc: '黄铜怀表，打开时表盖立着、秒针在走，表链盘在一边。' },
  { id: 'watch-parts', name: '修表的小零件', kind: '小件', states: ['摊开', '收进小盒'], desc: '齿轮从大到小排好、螺丝一颗颗站好，旁边是镊子和放大镜。' },

  // ———— 工具、文具 ————
  { id: 'toolbag', name: '亚托莉的工具包', kind: '小件', states: ['合着', '摊开'], desc: '帆布工具包，露出螺丝刀和钳子。' },
  { id: 'tool-box', name: '木工具箱', kind: '小件', states: ['合着', '打开'], desc: '带提手的木工具箱。' },
  { id: 'tools-carpentry', name: '木工工具', kind: '小件', states: ['摊开', '收好'], desc: '锯子、刨子、凿子、小锤。' },
  { id: 'stationery', name: '文具', kind: '小件', states: ['散着', '收好'], desc: '橡皮、尺子、铅笔、一卷胶带。' },
  { id: 'pen-holder', name: '笔筒', kind: '小件', states: ['插满', '空'], desc: '竹笔筒，插着几支笔和一支小毛笔。' },
  { id: 'sandpaper', name: '砂纸', kind: '小件', states: ['没拆', '用过'], desc: '一包木工砂纸；用过的卷了边、带着木屑。' },
  { id: 'sewing-box', name: '针线盒', kind: '小件', states: ['合着', '打开'], desc: '小木针线盒，打开时有线轴和针插。' },
  { id: 'phone', name: '手机', kind: '小件', states: ['黑屏', '亮着'], desc: '亚托莉的手机。' },
  { id: 'projector', name: '幻灯机', kind: '小件', states: ['修到一半', '修好了'], desc: '旧幻灯机，修到一半时镜头拆在旁边；旁边一盒玻璃幻灯片。' },
  { id: 'kite', name: '风筝', kind: '小件', states: ['糊好纸', '只有骨架'], desc: '方形竹骨风筝，糊好纸是红日图案。' },
  { id: 'kite-materials', name: '做风筝的材料', kind: '小件', states: ['摊开'], desc: '彩纸、削好的竹篾、浆糊、剪刀、几个线轴。' },
  { id: 'spools', name: '线轴', kind: '小件', states: ['两个', '一个'], desc: '缠着风筝线的木线轴。' },
  { id: 'shoji-kit', name: '糊障子的材料', kind: '小件', states: ['还没用', '用剩下的'], desc: '一卷和纸、刷子、一小碗米浆；用剩下的纸卷细了很多。' },
  { id: 'whetstone', name: '磨刀石', kind: '小件', states: ['湿的', '干的'], desc: '垫着布的磨刀石，湿的时候颜色深、旁边搭着擦刀布。' },
  { id: 'katana-rack', name: '丛雨丸和刀架', kind: '大件', states: ['刀在架上', '刀不在'], desc: '黑漆刀架；刀在架上就是丛雨丸横架着。' },
  { id: 'bucket', name: '木桶', kind: '大件', states: ['盛着水', '空'], desc: '桧木小桶，铜箍。' },
  { id: 'broom', name: '扫帚', kind: '大件', states: ['立着'], desc: '竹扫帚。' },
  { id: 'low-table-small', name: '小矮桌', kind: '大件', states: ['空着'], desc: '一张能随手搬的小矮桌（上面不能再放东西）。' },

  // ———— 固定设施（只能改状态）————
  { id: 'shoji-east', name: '东侧廊下的障子（一扇）', kind: '固定', states: ['新糊', '破洞'], desc: '东侧廊下朝院子的格子纸门，一共四扇。新糊 = 纸面白亮；破洞 = 纸发黄、右上角破了洞。' },
  { id: 'name-tag', name: '在室牌（一块）', kind: '固定', states: ['在', '外出'], desc: '玄关的在室牌，一人一块。「在」是黑字那面，「外出」翻到红字那面。' },
  { id: 'bath-pool', name: '温泉池', kind: '固定', states: ['放满了水', '没放水'], desc: '屋里引的一池温泉，能走进去泡，池边能坐人。没放水时池底露出来、没有热气。' },
  { id: 'irori', name: '地炉', kind: '固定', states: ['煮着汤', '生着火', '熄了'], desc: '煮着汤 = 铁锅吊在自在钩上、冒热气；生着火 = 只有炭火；熄了 = 炭灭了，只剩一炉灰。' },
  { id: 'futon-atri', name: '亚托莉的被褥', kind: '被褥', states: ['自动', '铺开', '叠好', '收进壁橱'], auto: '晚上和清晨铺开，白天和黄昏收进西侧壁橱', desc: '旧木屋带来的厚被 + 白枕头。铺开在她房间；叠好 = 叠成一摞放在她房间墙角；收进壁橱 = 放在西侧壁橱上层。' },
  { id: 'futon-murasame', name: '丛雨的被褥', kind: '被褥', states: ['自动', '铺开', '叠好', '收进壁橱'], auto: '晚上和清晨铺开，白天和黄昏收进西侧壁橱', desc: '樱色被子 + 毛毯。铺开在她房间；叠好 = 叠成一摞放在她房间墙角；收进壁橱 = 放在西侧壁橱上层。' },
  { id: 'lanterns', name: '灯笼', kind: '固定', states: ['自动', '点着', '熄着'], auto: '黄昏和夜里点着，白天熄着', desc: '院里的灯笼（大门的红提灯、前庭和院子的石灯笼）。' },
];

export const MODEL = Object.fromEntries(MODELS.map((m) => [m.id, m]));
export const kindsOf = (m) => [].concat(m.kind);
