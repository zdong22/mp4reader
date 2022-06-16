## 简介
这是一个mp4文件的结构解析包的nodejs实现，借鉴了[mp4包](https://www.npmjs.com/package/mp4 "mp4")的实现方法，但那位作者没有完成所有功能就停止更新了，这里是在他的基础上，重构了代码，但这个包更加纯粹，没有引用其它第三方包，之所以取名mp4reader，是向mp4reader软件的作者致敬，那个小工具很好用。拿到结构之后，就可以对关键帧进行解析，就可以实现nodejs对mp4的截帧。

## 支持解析的属性
![](./mp4container.svg)

## 用法

```
//引入方法
var { Mp4DecoderAll } = require( 'mp4reader')

//使用异步方法解析 
let mp4Info = await Mp4DecoderAll('test.mp4')

console.log(mp4Info)
//打印结果对象 
// -1 没有解析成功

//成功结果
{
  ftyp: {
    Start_offset: 0,
    Box_type: 'ftyp',
    Major_brand: 'isom',
    Minor_version: 512,
    Compatible_brands: 'isomiso2avc1mp4'
  },
  moov: {
    offset: 32,
    size: 16080,
    mvhd: {
      ctime: '1904/1/1 上午8:00:00',
      mtime: '1904/2/13 上午10:21:12',
      scale: 1000,
      duration: 13255,
      Start_offset: 40,
      Box_size: 108,
      Box_type: 'mvhd',
      version: 0,
      flags: 0
    },
    udta: -1,
    trak: [ [Object], [Object] ]
  }
}
```

## 方法介绍
- `Mp4DecoderAll()`  mp4结构全部导出


