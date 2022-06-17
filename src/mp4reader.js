// 引入fs的promise形式，避免使用回调
let  fsPromise  = require( 'fs/promises');
// let path = require('path')
let mp4Info = {
	ftyp: {},
	moov:{}
}

//判断是否是0x00 00 00 01
function FindStartCode2(buffer = Buffer.from([])){
	if(!buffer.length){
		return false
	}
	if(buffer[0] !=0 || buffer[1] != 0 || buffer[2] != 1){
		return false
	}else{
		return true
	}
}

//判断是否是0x00 00 00 01
function FindStartCode3(buffer = Buffer.from([])){
	if(!buffer.length){
		return false
	}
	if(buffer[0] !=0 || buffer[1] != 0 || buffer[2] != 0 || buffer[3] != 1){
		return false
	}else{
		return true
	}
}

// 获取文件基本信息，使用同步的方法，成功时将会打印文件信息并返回，错误时返回空对象
//目的是为了获取文件大小，便于下一步管理buffer
async function getFileInfoAsync(filename = ''){
	try{
		let stat = await	fsPromise.stat(filename)
		// console.log('fileInfo:',stat)
		return stat
	}
	catch(err){
		return {}
	}
		
}



// 找到moov盒子
async function Mp4FindMoov(filename = ''){
	if(filename == ''){
		return -1
	}
	// filename = path.resolve(filename);
	let offset = 0
	const MAX_BUFFER_LEN = 1024 * 1024  //1MB 空间
	let buff = Buffer.alloc(MAX_BUFFER_LEN) //共享内存
	for(let k =0 ;k < MAX_BUFFER_LEN * 1000; k++){
		let filehandle =  await fsPromise.open(filename)
		let { buffer , bytesRead} =await filehandle.read(buff, 0, MAX_BUFFER_LEN, offset )
		filehandle.close()
		if(bytesRead == 0){
			return  -1 //'没找到'
			break
		}else{
			let result = 	buffer.indexOf('moov')
			if(result > 0){
				return {
					offset:offset + result - 4,
					size:buff.readUInt32BE(result-4),
				}
			}else{
				// 继续下一个循环
			}
		}
		offset += MAX_BUFFER_LEN
	}
}

//解析moov盒子
async function Mp4DecodeMoov(filename = ''){
	let moovInfo = await Mp4FindMoov(filename)
	if(moovInfo == -1){
		// console.error('cannot find moov box')
		return -1 
	}
	// Object.assign(mp4Info.moov , moovInfo)
	let {size = 0, offset = 0} = moovInfo
	if(filename == '' || size === 0){
		// console.error('mp4 moov box info error')
		return -1
	}
	let filehandle =  await fsPromise.open(filename,'r')
	let buff = Buffer.alloc(size)
	let { buffer:moov_buffer , bytesRead} =await filehandle.read(buff, 0, size, offset )
	filehandle.close()
	if(bytesRead == 0){
		return  -1 //'没找到'
	}
	let mvhd = parse_mvhd(moov_buffer, offset)
	let udta = parse_udta(moov_buffer, offset)
	let trak = parse_trak(moov_buffer, offset)
	return {
		...moovInfo,
		mvhd: mvhd,
		udta:udta,
		trak:trak
	}
}


//解析mvhd盒子
var parse_mvhd = function( moov_buffer = Buffer.from([]),base_offset = 0) {
	// console.log("MVHD");
	let offset = moov_buffer.indexOf('mvhd')
	if(offset <  0){
		return -1 //没有mvhd盒子
	}
	offset -= 4
	// console.log(moov_buffer.slice(offset,offset+ 50))
	   let size = moov_buffer.readUInt32BE(offset )
	   let box_type = moov_buffer.slice(offset+4, offset + 8).toString()
		let version = moov_buffer[offset + 8]; // read 1 bytes 8bit unpacked C
		let flags = (moov_buffer.readUInt32BE(offset + 8) << 8 )>>8; // read 3 bytes
	
		let ctime = 0;
		let mtime = 0;
		let scale = 0;
		let duration = 0;
	
		if (version==0) {
			ctime = time1904To1970(moov_buffer.readUInt32BE(offset + 12)); // read 4 bytes unpacked N
			mtime =  time1904To1970(moov_buffer.readUInt32BE(offset + 16)); // read 4 bytes unpacked N
			scale =  moov_buffer.readUInt32BE(offset + 20); // read 4 bytes unpacked N
			duration =  moov_buffer.readUInt32BE(offset + 24); // read 4 bytes unpacked N
		} else if (version==1) {
			ctime = time1904To1970(moov_buffer.readDoubleBE(offset + 12)); // read 8 bytes unpacked Q
			mtime = time1904To1970(moov_buffer.readDoubleBE(offset + 20)); // read 8 bytes unpacked Q
			scale = moov_buffer.readUInt32BE(offset + 28); // read 4 bytes unpacked N
			duration = moov_buffer.readDoubleBE(offset + 32); // read 8 bytes unpacked Q
		}
		return {
			"ctime": ctime,
			"mtime": mtime,
			"scale": scale,
			"duration": duration,
			"Start_offset": offset + base_offset, 
			"Box_size": size, 
			"Box_type": box_type,
			"version": version,
			"flags": flags,
		}
}

var parse_trak = function(moov_buffer = Buffer.from([]),base_offset = 0) {
	let trak = []
	// console.log("TRAK");
	// 这里比较特殊，可能有多个trak，必须找出所有trak
	let trak_offset_list = []
	for(let i = 0;i< moov_buffer.length;){
		let offset = moov_buffer.indexOf('trak',i)
		if(offset <  0){
			break;
		}
		let size = moov_buffer.readUInt32BE(offset -4 )
		trak_offset_list.push(offset)
		i = offset + size - 4
	}
	// console.log('trak_offset_list',trak_offset_list)
	trak_offset_list.forEach(ele=> {
		let offset = ele
		offset -= 4
		let size = moov_buffer.readUInt32BE(offset ) //read 4 bytes unpacked N
		let box_type = moov_buffer.slice(offset+4, offset + 8).toString() //read 4 bytes	
			// 8 Bytes reserved;
		let tkhd = parse_tkhd(moov_buffer.slice(offset) ,offset + base_offset)
		let mdia = parse_mdia(moov_buffer.slice(offset) ,offset + base_offset)
		trak.push({
			"Start_offset": offset + base_offset, 
			"Box_size": size, 
			"Box_type": box_type,
			tkhd:tkhd,
			mdia:mdia
		})
	});
	
	return trak
		
	
}

async function Mp4DecodeFtyp(filename = ''){
	if(filename == ''){
		return -1
	}
	let offset = 0
	// filename = path.resolve(filename);
	let buff = Buffer.alloc(32)
	let filehandle =  await fsPromise.open(filename)
	let { buffer , bytesRead} =await filehandle.read(buff, 0, 32, offset )
	filehandle.close()
	if(bytesRead == 0){
		return  -2 //'没找到'
	}else{
		//按照mp4格式解析即可
		// 4-7为ftyp  8-11为Major_brand 12-15为Minor_version 16-31为Compatible_brands
		let box_type = buffer.slice(4,8).toString()
		let Major_brand = buffer.slice(8,12).toString()
		let Minor_version = buffer.slice(12,16).readUInt32BE()
		let Compatible_brands = buffer.slice(16,31).toString()
		// console.log(box_type)
		if(box_type !== 'ftyp'){
			return -3
		}else{
			return {
				Start_offset: 0,
				Box_type: box_type,
				Major_brand: Major_brand,
				Minor_version: Minor_version,
				Compatible_brands: Compatible_brands
			}
		}
	}
}

async function Mp4DecodeAll (filename = ''){
	if(filename == ''){
		return -1
	}
	// step1 decode box ftyp
	let ftyp = await Mp4DecodeFtyp(filename)
	if(ftyp < 0){
		console.error('mp4 wrong format')
		return -1 
	}
	
	Object.assign(mp4Info.ftyp , ftyp)
	// 合并ftyp

	// step2 decode box moov
	let moov=await Mp4DecodeMoov(filename)
	Object.assign(mp4Info.moov , moov)

	return mp4Info
}

function parse_tkhd(moov_buffer = Buffer.from([]),base_offset = 0){
	// console.log("TKHD");
	let offset = moov_buffer.indexOf('tkhd')
	if(offset <  0){
		return -1 
	}
	offset -= 4
	let size = moov_buffer.readUInt32BE(offset )
	let box_type = moov_buffer.slice(offset+4, offset + 8).toString()
	let version = moov_buffer[offset + 8]; // read 1 bytes 8bit unpacked C
	let flags = (moov_buffer.readUInt32BE(offset + 8) << 8 )>>8; // read 3 bytes

	let ctime = 0;
	let mtime = 0;
	let track_id = 0;
	let reserved = 0;
	let duration = 0;
	let layer = 0	//2 Byte
	let alternate_group = 0 //2 Byte
	let volume = 0 		//2 Byte 整数.小数
	let matrix = 0 //36 Byte
	let width = 0 //4 Byte
	let height = 0 // 4Byte

	if (version==0) {
		ctime = time1904To1970(moov_buffer.readUInt32BE(offset + 12)); // read 4 bytes unpacked N
		mtime =  time1904To1970(moov_buffer.readUInt32BE(offset + 16)); // read 4 bytes unpacked N
		track_id =  moov_buffer.readUInt32BE(offset + 20); // read 4 bytes unpacked N
		reserved =  moov_buffer.readUInt32BE(offset + 24); // read 4 bytes unpacked N
		duration =  moov_buffer.readUInt32BE(offset + 28); // read 4 bytes unpacked N
		//8 bytes reserved
		layer =  moov_buffer.readUInt16BE(offset + 40) //2
		alternate_group =  moov_buffer.readUInt16BE(offset + 42) //2
		volume =  moov_buffer.readUInt16BE(offset + 44) //2
		matrix =  moov_buffer.slice(offset+46,offset + 82) //36
		width  =  moov_buffer.readUInt32BE(offset + 82); // read 4 bytes 
		height  =  moov_buffer.readUInt32BE(offset + 86); // read 4 bytes 
	} else if (version==1) {
		ctime = time1904To1970(moov_buffer.readDoubleBE(offset + 12)); // read 8 bytes unpacked Q
		mtime = time1904To1970(moov_buffer.readDoubleBE(offset + 20)); // read 8 bytes unpacked Q
		track_id = moov_buffer.readUInt32BE(offset + 28); // read 4 bytes unpacked N
		reserved = moov_buffer.readUInt32BE(offset + 32); // read 4 bytes unpacked N
		duration = moov_buffer.readUInt32BE(offset + 36); // read 4 bytes unpacked Q
		//8 bytes reserved
		layer =  moov_buffer.readUInt16BE(offset + 48) //2
		alternate_group =  moov_buffer.readUInt16BE(offset + 50) //2
		volume =  moov_buffer.readUInt16BE(offset + 52) //2
		matrix =  moov_buffer.slice(offset+54,offset + 90) //36
		width  =  moov_buffer.readUInt32BE(offset + 90); // read 4 bytes 
		height  =  moov_buffer.readUInt32BE(offset + 94); // read 4 bytes 
	}
	
	return {
		"ctime": ctime,
		"mtime": mtime,
		"track_id": track_id,
		"duration": duration,
		"layer":layer,
		"alternate_group":alternate_group,
		"volume":volume,
		"matrix":matrix,
		"width":width,
		"height":height,
		"Start_offset": offset + base_offset, 
		"Box_size": size, 
		"Box_type": box_type,
		"version": version,
		"flags": flags,
	}
}

function parse_mdia(moov_buffer = Buffer.from([]),base_offset = 0){
	// console.log("MDIA");
	let offset = moov_buffer.indexOf('mdia')
	if(offset <  0){
		return -1 
	}
	offset -= 4
	let size = moov_buffer.readUInt32BE(offset )
	let box_type = moov_buffer.slice(offset+4, offset + 8).toString()
	let mdhd = parse_mdhd(moov_buffer, base_offset )
	let hdlr = parse_hdlr(moov_buffer, base_offset )
	let minf = parse_minf(moov_buffer, base_offset )
	return {
		"Start_offset": offset + base_offset, 
		"Box_size": size, 
		"Box_type": box_type,
		mdhd: mdhd,
		hdlr: hdlr,
		minf: minf
	}
}

function parse_mdhd(moov_buffer = Buffer.from([]),base_offset = 0){
	// console.log("MDHD");
	let offset = moov_buffer.indexOf('mdhd')
	if(offset <  0){
		return -1 
	}
	offset -= 4
	let size = moov_buffer.readUInt32BE(offset )
	let box_type = moov_buffer.slice(offset+4, offset + 8).toString()
	return {
		"Start_offset": offset + base_offset, 
		"Box_size": size, 
		"Box_type": box_type,
	}
}

//可以判断轨道类型，Handler type vide / soun
function parse_hdlr(moov_buffer = Buffer.from([]),base_offset = 0){
	// console.log("HDLR");
	let offset = moov_buffer.indexOf('hdlr')
	if(offset <  0){
		return -1 
	}
	offset -= 4
	let size = moov_buffer.readUInt32BE(offset )
	let box_type = moov_buffer.slice(offset+4, offset + 8).toString()
	let version = moov_buffer[offset + 8]; // read 1 bytes 8bit unpacked C
	let flags = (moov_buffer.readUInt32BE(offset + 8) << 8 )>>8; // read 3 bytes

	let Handler_type = moov_buffer.slice(offset+16, offset + 20).toString()
	let stringLength = size
	for(let i = 32; i <= size; i++){
		if(moov_buffer[offset + i] == 0x00){
			stringLength = i
			break;
		}
	}
	let Name = moov_buffer.slice(offset+32 , offset+stringLength).toString()
	return {
		"Start_offset": offset + base_offset, 
		"Box_size": size, 
		"Box_type": box_type,
		"version": version,
		"flags": flags,
		"Handler_type":Handler_type,
		"Name":Name
	}
}

function parse_minf(moov_buffer = Buffer.from([]),base_offset = 0){
	// console.log("MINF");
	let offset = moov_buffer.indexOf('minf')
	if(offset <  0){
		return -1 
	}
	offset -= 4
	let size = moov_buffer.readUInt32BE(offset )
	let box_type = moov_buffer.slice(offset+4, offset + 8).toString()

	let mhd = parse_mhd(moov_buffer,base_offset) // video: vmhd ; sound: smhd
	let box_name = 'vmhd'
	let dinf = parse_dinf(moov_buffer,base_offset)
	let stbl = parse_stbl(moov_buffer,base_offset)
	let Obj = {
		"Start_offset": offset + base_offset, 
		"Box_size": size, 
		"Box_type": box_type,
		dinf: dinf,
		stbl: stbl
	}
	if(mhd !== -1 && mhd.Box_type == 'vmhd'){
		Object.assign(Obj,{
			vmhd: mhd
		})
	}else if(mhd !== -1 && mhd.Box_type == 'smhd'){
		Object.assign(Obj,{
			smhd: mhd
		})
	}

	return  Obj
}

function parse_mhd(moov_buffer = Buffer.from([]),base_offset = 0){
	// console.log("VMHD");
	let offset = moov_buffer.indexOf('vmhd')
	if(offset == -1){
		offset = moov_buffer.indexOf('smhd')
	}

	if(offset <  0){
		return -1 
	}
	offset -= 4
	let size = moov_buffer.readUInt32BE(offset )
	let box_type = moov_buffer.slice(offset+4, offset + 8).toString()

	return {
		"Start_offset": offset + base_offset, 
		"Box_size": size, 
		"Box_type": box_type,
	}
}

function parse_dinf(moov_buffer = Buffer.from([]),base_offset = 0){
	// console.log("DINF");
	let offset = moov_buffer.indexOf('dinf')
	if(offset <  0){
		return -1 
	}
	offset -= 4
	let size = moov_buffer.readUInt32BE(offset )
	let box_type = moov_buffer.slice(offset+4, offset + 8).toString()

	return {
		"Start_offset": offset + base_offset, 
		"Box_size": size, 
		"Box_type": box_type,
		"dref":-1
	}
}

function parse_stbl(moov_buffer = Buffer.from([]),base_offset = 0){
	// console.log("STBL");
	let offset = moov_buffer.indexOf('stbl')
	if(offset <  0){
		return -1 
	}
	offset -= 4
	let size = moov_buffer.readUInt32BE(offset )
	let box_type = moov_buffer.slice(offset+4, offset + 8).toString()

	let stsd = parse_stsd(moov_buffer,base_offset)
	let stts = parse_stts(moov_buffer,base_offset)
	let stss = parse_stss(moov_buffer,base_offset)
	let ctts = parse_ctts(moov_buffer,base_offset)
	let stsc = parse_stsc(moov_buffer,base_offset)
	let stsz = parse_stsz(moov_buffer,base_offset)
	let stco = parse_stco(moov_buffer,base_offset)
	return {
		"Start_offset": offset + base_offset, 
		"Box_size": size, 
		"Box_type": box_type,
		stsd:stsd,
		stts:stts,
		stss: stss,
		ctts: ctts,
		stsc: stsc,
		stsz: stsz,
		stco: stco
	}
}

function parse_stsd(moov_buffer = Buffer.from([]),base_offset = 0){
	let offset = moov_buffer.indexOf('stsd')
	if(offset <  0){
		return -1 
	}
	offset -= 4
	let size = moov_buffer.readUInt32BE(offset )
	let box_type = moov_buffer.slice(offset+4, offset + 8).toString()
	let version = moov_buffer[offset + 8]; // read 1 bytes 8bit unpacked C
	let flags = (moov_buffer.readUInt32BE(offset + 8) << 8 )>>8; // read 3 bytes
	let entry_count = moov_buffer.readUInt32BE(offset +12 )
	let SampleEntry = moov_buffer.slice(offset+20, offset + 24).toString()
	switch (SampleEntry) {
		case 'avc1':
			let avc1 = parse_avc1(moov_buffer, base_offset)
			return {
				"Start_offset": offset + base_offset, 
				"Box_size": size, 
				"Box_type": box_type,
				entry_count:entry_count,
				SampleEntry:SampleEntry,
				avc1:avc1
			}
			break;
		case 'mp4a':
			let mp4a = parse_mp4a(moov_buffer, base_offset)
			return {
				"Start_offset": offset + base_offset, 
				"Box_size": size, 
				"Box_type": box_type,
				SampleEntry:SampleEntry,
				mp4a:mp4a
			}
			break;
		case 'mp4v':
			let mp4v = parse_mp4v(moov_buffer, base_offset)
			return {
				"Start_offset": offset + base_offset, 
				"Box_size": size, 
				"Box_type": box_type,
				SampleEntry:SampleEntry,
				mp4v:mp4v
			}
			break;
		case 'hev1': // h265编码
			let hev1 = parse_hev1(moov_buffer, base_offset)
			return {
				"Start_offset": offset + base_offset, 
				"Box_size": size, 
				"Box_type": box_type,
				SampleEntry:SampleEntry,
				hev1:hev1
			}
			break;
		default:
			break;
	}
	return {
		"Start_offset": offset + base_offset, 
		"Box_size": size, 
		"Box_type": box_type,
		SampleEntry:SampleEntry
	}
}
function parse_hev1(moov_buffer = Buffer.from([]),base_offset = 0){
	let offset = moov_buffer.indexOf('hev1')
	if(offset <  0){
		return -1 
	}
	offset -= 4
	let size = moov_buffer.readUInt32BE(offset )
	let box_type = moov_buffer.slice(offset+4, offset + 8).toString()
	
	return {
		"Start_offset": offset + base_offset, 
		"Box_size": size, 
		"Box_type": box_type,
	}
}
function parse_mp4v(){
	return -1
}
function parse_mp4a(moov_buffer = Buffer.from([]),base_offset = 0){
	let offset = moov_buffer.indexOf('mp4a')
	if(offset <  0){
		return -1 
	}
	offset -= 4
	let size = moov_buffer.readUInt32BE(offset )
	let box_type = moov_buffer.slice(offset+4, offset + 8).toString()
	let version = moov_buffer[offset + 8]; // read 1 bytes 8bit unpacked C
	let flags = (moov_buffer.readUInt32BE(offset + 8) << 8 )>>8; // read 3 bytes
	// 8 bytes reserved 这里与一些文档的16字节有些不符
	let Channel_count = moov_buffer.readUInt16BE(offset + 24)
	let Sample_size = moov_buffer.readUInt16BE(offset + 26)
	//4 Bytes reserved
	let Sample_rate = moov_buffer.readUInt32BE(offset + 30)
	return {
		"Start_offset": offset + base_offset, 
		"Box_size": size, 
		"Box_type": box_type,
		"version": version,
		"flags": flags,
		"Channel_count":Channel_count,
		"Sample_size":Sample_size,
		"Sample_rate":Sample_rate,
		"esds": -1
	}
}
function parse_avc1(moov_buffer = Buffer.from([]),base_offset = 0){
	let offset = moov_buffer.indexOf('avc1')
	if(offset <  0){
		return -1 
	}
	offset -= 4
	let size = moov_buffer.readUInt32BE(offset )
	let box_type = moov_buffer.slice(offset+4, offset + 8).toString()
	let version = moov_buffer[offset + 8]; // read 1 bytes 8bit unpacked C
	let flags = (moov_buffer.readUInt32BE(offset + 8) << 8 )>>8; // read 3 bytes

	let width = moov_buffer.readUInt16BE(offset + 32)
	let height = moov_buffer.readUInt16BE(offset + 34)
	let Horiz_resolution = moov_buffer.readUInt32BE(offset + 36)
	let Ver_resolution = moov_buffer.readUInt32BE(offset + 36)
	// 4 Bytes reserved
	let Frame_count = moov_buffer.readUInt16BE(offset + 44) //每个采样中的帧数
	let avcC = parse_avcC(moov_buffer, base_offset )
	return {
		"Start_offset": offset + base_offset, 
		"Box_size": size, 
		"Box_type": box_type,
		"version": version,
		"flags": flags,
		width:width,
		height: height,
		Horiz_resolution:Horiz_resolution,
		Ver_resolution: Ver_resolution,
		Frame_count: Frame_count,
		avcC: avcC
	}
}

function parse_avcC(moov_buffer = Buffer.from([]),base_offset = 0){
	let offset = moov_buffer.indexOf('avcC')
	if(offset <  0){
		return -1 
	}
	offset -= 4
	let size = moov_buffer.readUInt32BE(offset )
	let box_type = moov_buffer.slice(offset+4, offset + 8).toString()
	let Configuration_version = moov_buffer[offset + 8]; // read 1 bytes 8bit 
	let AVC_profile_indication = moov_buffer[offset + 9] // read 1 bytes 8bit 
	let AVC_profile_compatibility = moov_buffer[offset + 10] // read 1 bytes 8bit 
	let AVC_level_indication = moov_buffer[offset + 11] // read 1 bytes 8bit 
	// 5 Bit reserved
	let NALU_length_size = (moov_buffer[offset + 12] & 0x03)  + 1
	//3 Bit reserved
	// let Num_sequence_parameter_sets = moov_buffer[offset + 13] 
	let Num_sequence_parameter_sets = (moov_buffer[offset + 13] & 0x1F)
	
	
	//sometime maybe not only one SPS / PPS, decided by Num_sequence_parameter_sets
	let SPS  = []//Sequence parameter set 
	let point = offset + 14
	for(let i  = 0 ;i< Num_sequence_parameter_sets; i++){
		let len =  moov_buffer.readUint16BE(point)
		let sps_array =moov_buffer.slice(point + 2, point + 2 + len )
		SPS.push(...sps_array) //Buffer to array
		point = point + len +2
	}
	let Num_picture_parameter_sets = moov_buffer[point]
	let PPS = []
	for(let i  = 0 ;i< Num_picture_parameter_sets; i++){
		let len =  moov_buffer.readUint16BE(point + 1)
		let pps_array =  Uint8Array.from(moov_buffer.slice(point + 3, point + 3 + len ))
		PPS.push(...pps_array) //Buffer to array
		point = point + len +2
	}
	return {
		"Start_offset": offset + base_offset, 
		"Box_size": size, 
		"Box_type": box_type,
		"Configuration_version": Configuration_version,
		"AVC_profile_indication": AVC_profile_indication,
		"AVC_profile_compatibility": AVC_profile_compatibility,
		"AVC_level_indication": AVC_level_indication,
		NALU_length_size: NALU_length_size,
		SPS: SPS,
		PPS: PPS,
		Num_sequence_parameter_sets:Num_sequence_parameter_sets,
		Num_picture_parameter_sets: Num_picture_parameter_sets
		
	}

}
function parse_stts(moov_buffer = Buffer.from([]),base_offset = 0){
	let offset = moov_buffer.indexOf('stts')
	if(offset <  0){
		return -1 
	}
	offset -= 4
	let size = moov_buffer.readUInt32BE(offset )
	let box_type = moov_buffer.slice(offset+4, offset + 8).toString()
	let version = moov_buffer[offset + 8]; // read 1 bytes 8bit unpacked C
	let flags = (moov_buffer.readUInt32BE(offset + 8) << 8 )>>8; // read 3 bytes

	let count = moov_buffer.readUInt32BE(offset + 12) //time-to-sample count
	let Time_to_sample = []
	for(let i = 0;i < count;i++){
		Time_to_sample.push({
			No: i+1,
			Sample_count: moov_buffer.readUInt32BE(offset + 16 + i * 8),
			Sample_duration: moov_buffer.readUInt32BE(offset + 16 + 4+ i * 8),
		})
	}
	return {
		"Start_offset": offset + base_offset, 
		"Box_size": size, 
		"Box_type": box_type,
		"version": version,
		"flags": flags,
		count: count,
		Time_to_sample: Time_to_sample
	}
}

//stss确定 media 中的关键帧
function parse_stss(moov_buffer = Buffer.from([]),base_offset = 0){
	let offset = moov_buffer.indexOf('stss')
	if(offset <  0){
		return -1 //音频是没有stss的
	}
	offset -= 4
	let size = moov_buffer.readUInt32BE(offset )
	let box_type = moov_buffer.slice(offset+4, offset + 8).toString()
	let version = moov_buffer[offset + 8]; // read 1 bytes 8bit unpacked C
	let flags = (moov_buffer.readUInt32BE(offset + 8) << 8 )>>8; // read 3 bytes

	let count = moov_buffer.readUInt32BE(offset + 12) 
	let Sample_list = []
	for(let i = 0;i < count;i++){
		No: i+1,
		Sample_list.push(moov_buffer.readUInt32BE(offset + 16 + i * 4))
	}
	return {
		"Start_offset": offset + base_offset, 
		"Box_size": size, 
		"Box_type": box_type,
		"version": version,
		"flags": flags,
		count: count,
		Sample_list: Sample_list
	}
}
function parse_ctts(moov_buffer = Buffer.from([]),base_offset = 0){
	let offset = moov_buffer.indexOf('ctts')
	if(offset <  0){
		return -1 
	}
	offset -= 4
	let size = moov_buffer.readUInt32BE(offset )
	let box_type = moov_buffer.slice(offset+4, offset + 8).toString()
	let version = moov_buffer[offset + 8]; // read 1 bytes 8bit unpacked C
	let flags = (moov_buffer.readUInt32BE(offset + 8) << 8 )>>8; // read 3 bytes

	let count = moov_buffer.readUInt32BE(offset + 12) 
	let Sample_list = []
	for(let i = 0;i < count;i++){
		Sample_list.push({
			No: i + 1,
			Sample_count: moov_buffer.readUInt32BE(offset + 16 + i * 8),
			Sample_offset: moov_buffer.readUInt32BE(offset + 16 + 4 + i * 8),
		})
	}
	return {
		"Start_offset": offset + base_offset, 
		"Box_size": size, 
		"Box_type": box_type,
		"version": version,
		"flags": flags,
		count: count,
		Sample_list: Sample_list
	}
}

//sample-to-chunk
function parse_stsc(moov_buffer = Buffer.from([]),base_offset = 0){
	let offset = moov_buffer.indexOf('stsc')
	if(offset <  0){
		return -1 
	}
	offset -= 4
	let size = moov_buffer.readUInt32BE(offset )
	let box_type = moov_buffer.slice(offset+4, offset + 8).toString()
	let version = moov_buffer[offset + 8]; // read 1 bytes 8bit unpacked C
	let flags = (moov_buffer.readUInt32BE(offset + 8) << 8 )>>8; // read 3 bytes

	let count = moov_buffer.readUInt32BE(offset + 12) 
	let Sample_to_chunk = []
	for(let i = 0;i < count;i++){
		Sample_to_chunk.push({
			No: i+1,
			First_chunk: moov_buffer.readUInt32BE(offset + 16 + i * 8),
			Sample_perchunk: moov_buffer.readUInt32BE(offset + 16 + 4+ i * 8),
			Sample_description_index: moov_buffer.readUInt32BE(offset + 16 + 8+ i * 8),
		})
	}
	return {
		"Start_offset": offset + base_offset, 
		"Box_size": size, 
		"Box_type": box_type,
		"version": version,
		"flags": flags,
		count: count,
		Sample_to_chunk: Sample_to_chunk
	}
}

//Sample Size Boxes
function parse_stsz(moov_buffer = Buffer.from([]),base_offset = 0){
	let offset = moov_buffer.indexOf('stsz')
	if(offset <  0){
		return -1 
	}
	offset -= 4
	let size = moov_buffer.readUInt32BE(offset )
	let box_type = moov_buffer.slice(offset+4, offset + 8).toString()
	let version = moov_buffer[offset + 8]; // read 1 bytes 8bit unpacked C
	let flags = (moov_buffer.readUInt32BE(offset + 8) << 8 )>>8; // read 3 bytes

	let Sample_size = moov_buffer.readUInt32BE(offset + 12) 
	let Sample_count = moov_buffer.readUInt32BE(offset + 16) 
	let Sample_size_list = []
	if(Sample_size == 0){
		for(let i = 0;i < Sample_count;i++){
			Sample_size_list.push({
				No: i+1,
				Sample_size: moov_buffer.readUInt32BE(offset + 20 + i * 4),
			})
		}
	}
	
	return {
		"Start_offset": offset + base_offset, 
		"Box_size": size, 
		"Box_type": box_type,
		"version": version,
		"flags": flags,
		Sample_size: Sample_size,
		Sample_count: Sample_count,
		Sample_size_list: Sample_size_list
	}
}

//Chunk Offset Box
function parse_stco(moov_buffer = Buffer.from([]),base_offset = 0){
	let offset = moov_buffer.indexOf('stco')
	if(offset <  0){
		return -1 
	}
	offset -= 4
	let size = moov_buffer.readUInt32BE(offset )
	let box_type = moov_buffer.slice(offset+4, offset + 8).toString()
	let version = moov_buffer[offset + 8]; // read 1 bytes 8bit unpacked C
	let flags = (moov_buffer.readUInt32BE(offset + 8) << 8 )>>8; // read 3 bytes

	let count = moov_buffer.readUInt32BE(offset + 12) //time-to-sample count
	let Chunk_offset_list = []
	for(let i = 0;i < count;i++){
		Chunk_offset_list.push({
			No: i+1,
			Chunk_offset: moov_buffer.readUInt32BE(offset + 16 + i * 4),
		})
	}


	return {
		"Start_offset": offset + base_offset, 
		"Box_size": size, 
		"Box_type": box_type,
		"version": version,
		"flags": flags,
		count: count,
		Chunk_offset_list: Chunk_offset_list
	}
}

function parse_udta(moov_buffer = Buffer.from([]),base_offset = 0){
	// console.log('UDTA')
	return -1
}
function time1904To1970 (UTC = 0){
	return new Date(UTC  - 2082844800000).toLocaleString()
}
//传入配置参数
async function Mp4DecodeByModule(filename = '' ,configOption = ['ftyp']){
	if(typeof configOption != 'object' || filename == ''){
		return -1
	}
	let option = {
		ftyp : false,
		moov : false,
		mvhd : false,
		trak : false,
		tkhd : false,
		mdia : false,
		hdlr : false,
		minf : false,
		stbl : false,
		stsd : false,
		stts : false,
		stss : false,
		ctts : false,
		stsc : false,
		stsz : false,
		stco : false,
	}
	configOption.forEach(el => {
		if(option.hasOwnProperty(el)){
			option[el] = true
		}
	})

	let resdata = {}

	let moovInfo = await Mp4FindMoov(filename)
	// Object.assign(resdata , {...moovInfo})
	let {size = 0, offset = 0} = moovInfo
	if(size === 0 || moovInfo == -1){
		return -1
	}

	let filehandle =  await fsPromise.open(filename,'r')
	let buff = Buffer.alloc(size)
	let { buffer:moov_buffer , bytesRead} =await filehandle.read(buff, 0, size, offset )
	filehandle.close()
	if(bytesRead == 0){
		return  -1 
	}

	for(let key in option){
		switch (key){
			case 'ftyp':
				if(option[key]){
					let ftyp = await Mp4DecodeFtyp(filename)
					Object.assign(resdata , {ftyp : ftyp})
				}
				break
			case 'moov':
				if(option[key]){
					let mvhd = parse_mvhd(moov_buffer, offset)
					let udta = parse_udta(moov_buffer, offset)
					let trak = parse_trak(moov_buffer, offset)
					Object.assign(resdata , {
						moov:
							{
							...moovInfo,
							mvhd: mvhd,
							udta:udta,
							trak:trak
							}
						})
				}
				break
			case 'mvhd':
				if(option[key]){
					let mvhd = parse_mvhd(moov_buffer, offset)
					Object.assign(resdata , {mvhd:mvhd})
				}
				break
			case 'trak':
				if(option[key]){
					let trak = parse_trak(moov_buffer, offset)
					Object.assign(resdata , {trak: trak})
				}
				break
			case 'tkhd':
			case 'mdia':
			case 'hdlr':
			case 'minf':
			case 'stbl':
			case 'stsd':
			case 'stts':
			case 'stss':
			case 'ctts':
			case 'stsc':
			case 'stsz':
			case 'stco':
				if(option[key]){
					let trak_offset_list = getTrackList(moov_buffer, offset)
					let base_offset = offset
					let box_data = []
					trak_offset_list.forEach(ele=> {
						let offsetB = ele
						offsetB -= 4
						let size = moov_buffer.readUInt32BE(offsetB ) //read 4 bytes unpacked N
						let box_type = moov_buffer.slice(offsetB+4, offsetB + 8).toString() //read 4 bytes	
							// 8 Bytes reserved;
						let res = parse_exact_box(moov_buffer.slice(offsetB) ,offsetB + base_offset, key)
						box_data.push(res)
					});
					let obj = {}
					obj[key] = box_data
					Object.assign(resdata , obj)
				}
				break;
			default:
				break;
			
		}

	}
	return resdata
}

function parse_exact_box(buffer = [] ,offset = 0, key = null){
	switch(key){
		case 'tkhd':
			return parse_tkhd(buffer , offset )

		case 'mdia':
			return parse_mdia(buffer , offset )
		
		case 'hdlr':
			return parse_hdlr(buffer , offset )
		
		case 'minf':
			return parse_minf(buffer , offset )
		
		case 'stbl':
			return parse_stbl(buffer , offset )
		
		case 'stsd':
			return parse_stsd(buffer , offset )
		
		case 'stts':
			return parse_stts(buffer , offset )
		
		case 'stss':
			return parse_stss(buffer , offset )
		
		case 'ctts':
			return parse_ctts(buffer , offset )
		
		case 'stsc':
			return parse_stsc(buffer , offset )
		
		case 'stsz':
			return parse_stsz(buffer , offset )
		
		case 'stco':
			return parse_stco(buffer , offset )
		
	}
	return 
}
//返回轨道的偏移量数组，可以明确知道有几条轨道
function getTrackList (moov_buffer = Buffer.from([]),base_offset = 0){
		let trak = []
		// console.log("TRAK");
		// 这里比较特殊，可能有多个trak，必须找出所有trak
		let trak_offset_list = []
		for(let i = 0;i< moov_buffer.length;){
			let offset = moov_buffer.indexOf('trak',i)
			if(offset <  0){
				break;
			}
			let size = moov_buffer.readUInt32BE(offset -4 )
			trak_offset_list.push(offset)
			i = offset + size - 4
		}
		return trak_offset_list
		// console.log('trak_offset_list',trak_offset_list)
}
module.exports = {
	FindStartCode2:FindStartCode2, 
	FindStartCode3:FindStartCode3,
	getFileInfoAsync:getFileInfoAsync,
	Mp4FindMoov: Mp4FindMoov,
	Mp4DecodeFtyp: Mp4DecodeFtyp,
	Mp4DecodeAll: Mp4DecodeAll,
	Mp4DecodeByModule:Mp4DecodeByModule
}