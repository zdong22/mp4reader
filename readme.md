[English](readme.md) | [简体中文](readme_ch.md) 
## introduce
This is a nodejs implementation of the structure parsing package of mp4 files, borrowing the implementation method of [mp4 package] (https://www.npmjs.com/package/mp4 "mp4"), but the author stopped updating without completing all the functions, here is on his basis, refactored the code, but this package is more pure, does not reference other third-party packages, the reason for the name mp4reader, It is a tribute to the author of the mp4reader software, that gadget is very easy to use. After getting the structure, you can parse the keyframe, and you can realize the screenshot of MP4 by NodeJS.

## Properties that support resolution
![](./mp4container.svg)

## usage

```
//引入方法
var { Mp4DecoderAll } = require( 'mp4reader')

// Use asynchronous methods to resolve all supported structures 
let mp4Info = await Mp4DecodeAll('test.mp4')

console.log(mp4Info)
//Print the result object 
// -1 No parsing succeeded

//Successful results
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

//example 2
//Export by module
var { Mp4DecodeByModule } = require( 'mp4reader')
let mp4Info = await Mp4DecodeByModule(filename ,['hdlr','ftyp']) 
console.log(mp4Info)

//Successful results
{
  ftyp: {
    Start_offset: 0,
    Box_type: 'ftyp',
    Major_brand: 'isom',
    Minor_version: 512,
    Compatible_brands: 'isomiso2avc1mp4'
  },
  hdlr: [
    {
      Start_offset: 324,
      Box_size: 45,
      Box_type: 'hdlr',
      version: 0,
      flags: 0,
      Handler_type: 'vide',
      Name: 'VideoHandler'
    },
    {
      Start_offset: 8221,
      Box_size: 45,
      Box_type: 'hdlr',
      version: 0,
      flags: 0,
      Handler_type: 'soun',
      Name: 'SoundHandler'
    }
  ]
}
```

## Introduction of methods
- `Mp4DecoderAll()`  All MP4 structure information is exported
- `Mp4DecodeFtyp()`  Returns MP4 structure FPap box information
- `Mp4FindMoov()`  Returns MOOV box information: location, dimensions
- `getFileInfoAsync` Returns fs.stat class information, including file size
- `Mp4DecodeByModule(filename ,option: [])` The parameters are an array of file names and box names, and optional parameters are ftyp  moov  mvhd trak tkhd   mdia hdlr  minf  stbl stsd stts  stss ctts  stsc stsz stco
For example, Mp4DecodeByModule('test.mp4', ['stsd', 'stss']), the upper and lower levels do not conflict, but the parent box will contain the lower content, such as the moov box will contain trak content

## Update records
0.1.5
【fix】Module export method fix
0.1.4 
【change】The main method name was changed from 'Mp4DecoderAll' to 'Mp4DecodeAll'
【add】Modular export method 'Mp4DecodeByModule'
【Optimization】Adjusted the document structure to be more reasonable

0.1.3
【Optimization】Optimized some issues


