/**
 * Created by Primoz on 24.4.2016.
 */
import {WEBGL1, WEBGL2, _ProgramCaching} from '../constants.js';
import {GLFrameBufferManager} from './GLFrameBufferManager.js';
import {GLTextureManager} from './GLTextureManager.js';
import {GLAttributeManager} from './GLAttributeManager.js';

import {Line} from '../objects/Line.js';
import {Point} from '../objects/Point.js';

import {CustomShaderMaterial} from '../materials/CustomShaderMaterial.js';

import {Vector4} from '../math/Vector4.js';

export class GLManager {

		/**
		 * Creates new WebGL context manager. The context is retrieved from the given canvas.
		 * @param {canvas} canvas HTML5 canvas from which GL context is retrieved
		 * @param gl_version Specifies which version of GL context should be retrieved
		 */
		constructor (canvas, glVersion, optionalContextAttributes) {
				// region GL Context fetch
				this._gl = null;
				this._glVersion = glVersion;

				var glKeys = (glVersion == WEBGL1) ? ["webgl", "experimental-webgl"] : ["webgl2", "experimental-webgl2"];

				// Try to fetch GL context
				for (var i = 0; i < glKeys.length; i++) {
						try {
								this._gl = canvas.getContext(glKeys[i], optionalContextAttributes);
						} catch (e){
								console.error(e);
						}

						if (this._gl) {
								break;
						}
				}

				// Warn the user if the context could not be retrieved
				if (!this._gl) {
						throw 'ERROR: Failed to retrieve GL Context.'
				}
				// endregion

				let ext = this._gl.getExtension("EXT_color_buffer_float");

				// region CONSTANTS
				this._FIRST_COLOR_ATTACHMENT = this._gl.COLOR_ATTACHMENT0;
				this._LAST_COLOR_ATTACHMENT = this._gl.COLOR_ATTACHMENT15;
				// endregion

				this._fboManager = new GLFrameBufferManager(this._gl);
				this._textureManager = new GLTextureManager(this._gl);
				this._attributeManager = new GLAttributeManager(this._gl);

				// region Clear values
				this.autoClear = true;
				this._clearColor = new Vector4(0, 0, 0, 0);
				this._clearDepth = null;
				this._clearStencil = null;

				// Initialize clear values
				this.setClearColor(0, 0, 0, 0);
				this.setClearDepth(1);
				this.setClearStencil(0);
				// endregion
		}

		updateBufferAttribute(bufferAttribute, isElementBuffer) {
				if (isElementBuffer) {
						this._attributeManager.updateAttribute(bufferAttribute, this._gl.ELEMENT_ARRAY_BUFFER);
				}
				else {
						this._attributeManager.updateAttribute(bufferAttribute, this._gl.ARRAY_BUFFER);
				}
		}

		/**
		 * Updates object geometry attributes (creates GL buffers or updates them if they already exist)
		 * @param object
		 */
		updateObjectData(object) {
				// BufferedGeometry
				let geometry = object.geometry;

				// region GEOMETRY ATTRIBUTES
				if (geometry.indices !== null) {
						this._attributeManager.updateAttribute(geometry.indices, this._gl.ELEMENT_ARRAY_BUFFER);
				}

				if (geometry.vertices != null) {
						this._attributeManager.updateAttribute(geometry.vertices, this._gl.ARRAY_BUFFER);
				}

				if (geometry.drawWireframe && !(object instanceof Point) && !(object instanceof Line)) {
						if (geometry.wireframeIndices === null) {
								geometry.buildWireframeBuffer();
						}
						
						this._attributeManager.updateAttribute(geometry.wireframeIndices, this._gl.ELEMENT_ARRAY_BUFFER);
				}

				if (geometry.normals != null) {
						this._attributeManager.updateAttribute(geometry.normals, this._gl.ARRAY_BUFFER);
				}

				if (geometry._vertColor != null) {
						this._attributeManager.updateAttribute(geometry._vertColor, this._gl.ARRAY_BUFFER);
				}

				if (geometry._uv != null) {
						this._attributeManager.updateAttribute(geometry._uv, this._gl.ARRAY_BUFFER);
				}
				if (geometry._uvw != null) {
					this._attributeManager.updateAttribute(geometry._uvw, this._gl.ARRAY_BUFFER);
				}
				//Added by Sebastien
				if (geometry.MMat != null) {
					this._attributeManager.updateAttribute(geometry.MMat, this._gl.ARRAY_BUFFER);
				}
				// endregion

				// region MATERIAL ATTRIBUTES
				let material = object.material;

				// Update textures
				let textures = material.maps;

				for (let i = 0; i < textures.length; i++) {
						this._textureManager.updateTexture(textures[i], false);
                    	this._textureManager.updateTextureSubImage(textures[i], false);
				}

				// CustomShaderMaterial may specify extra attributes
				if (object.material instanceof CustomShaderMaterial) {
						let customAttributes = object.material._attributes;

						// Update GL version of all of the custom attributes
						for (let name in customAttributes) {
								if (customAttributes.hasOwnProperty(name)) {
										this._attributeManager.updateAttribute(customAttributes[name], this._gl.ARRAY_BUFFER);
								}
						}
				}
				//endregion
		}

		initRenderTarget(renderTarget) {
				let glTexture;
				let drawBuffersLength;
				let drawAttachments = [];

				// Bind the framebuffer matching the specified render target
				this._fboManager.bindFramebuffer(renderTarget);

				// region DEPTH
				if (renderTarget.depthTexture !== null) {
						// Fetch and update the texture
						glTexture = this._textureManager.updateTexture(renderTarget.depthTexture, true);

						// Attach as framebuffer depth attachment
						this._gl.framebufferTexture2D(this._gl.FRAMEBUFFER, this._gl.DEPTH_ATTACHMENT, this._gl.TEXTURE_2D, glTexture, 0);

						// Unbind the texture (binded in the texture manager)
						this._gl.bindTexture(this._gl.TEXTURE_2D, null);
				}
				else {
						// If the depth texture is not specified remove the depth attachment from the frame buffer
						this._gl.framebufferTexture2D(this._gl.FRAMEBUFFER, this._gl.DEPTH_ATTACHMENT, this._gl.TEXTURE_2D, null, 0);
				}
				// endregion

				// region COLOR ATTACHMENTS (DRAW BUFFERS)
				drawBuffersLength = renderTarget.sizeDrawBuffers();

				// TODO: Is it reasonable to check if there are more than 15 draw buffers?
				for (let i = 0; i < drawBuffersLength; i++) {
						glTexture = this._textureManager.updateTexture(renderTarget._drawBuffers[i], true);

						// Attach draw buffer as color attachment (in specified order)
						this._gl.framebufferTexture2D(this._gl.FRAMEBUFFER, this._FIRST_COLOR_ATTACHMENT + i, this._gl.TEXTURE_2D, glTexture, 0);
						drawAttachments.push(this._FIRST_COLOR_ATTACHMENT + i);
				}

				// Unbind the texture (binded in the texture manager)
				this._gl.bindTexture(this._gl.TEXTURE_2D, null);

				// Unbind any attachments left from the previous renders
				if (renderTarget.__fboLength !== null && renderTarget.__fboLength > drawBuffersLength) {
						for (let i = drawBuffersLength; i < renderTarget.__fboLength; i++) {
								this._gl.framebufferTexture2D(this._gl.FRAMEBUFFER, this._FIRST_COLOR_ATTACHMENT + i, this._gl.TEXTURE_2D, null, 0);
						}
				}

				// Setup draw buffers
				this._gl.drawBuffers(drawAttachments);

				// Private length specifying number of attachments used in previous renders
				renderTarget.__fboLength = drawBuffersLength;
				// endregion

				// Validation
				if (this._gl.checkFramebufferStatus(this._gl.FRAMEBUFFER) !== this._gl.FRAMEBUFFER_COMPLETE) {
						console.error("Render target: framebuffer not complete!");

						switch (this._gl.checkFramebufferStatus(this._gl.FRAMEBUFFER)) {
								case this._gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
										console.error("FRAMEBUFFER_INCOMPLETE_ATTACHMENT: The attachment types are mismatched or not all framebuffer attachment points are framebuffer attachment complete.");
										break;
								case this._gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
										console.error("FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT: There is no attachment.");
										break;
								case this._gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
										console.error("FRAMEBUFFER_INCOMPLETE_DIMENSIONS: Problem with the texture dimensions.");
										break;
								case this._gl.FRAMEBUFFER_UNSUPPORTED:
										console.error("FRAMEBUFFER_UNSUPPORTED: The format of the attachment is not supported or if depth and stencil attachments are not the same renderbuffer.");
										break;
								case this._gl.FRAMEBUFFER_INCOMPLETE_MULTISAMPLE:
										console.error("FRAMEBUFFER_INCOMPLETE_MULTISAMPLE: The values of gl.RENDERBUFFER_SAMPLES are different among attached renderbuffers, or are non-zero if the attached images are a mix of renderbuffers and textures.");
										break;
								default:
										console.error("Unknown error! Abandon hope all ye who enter here.")
						}
				}
		}

		cleanupRenderTarget() {
				this._fboManager.unbindFramebuffer();
		}

		getTexture(reference) {
			return this._textureManager.getTexture(reference);
		}

		//Added by Sebastien
		/*openTextureInNewTab(reference){//DEPRECATED
			const data = new Uint8Array(reference.width * reference.height * 4);
			
			const fb = this._gl.createFramebuffer();
			this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, fb);
			const texture = this._textureManager.getTexture(reference);
			this._gl.framebufferTexture2D(this._gl.FRAMEBUFFER, this._gl.COLOR_ATTACHMENT0, this._gl.TEXTURE_2D, texture, 0);
			this._gl.readPixels(0, 0, reference.width, reference.height, this._gl.RGBA, this._gl.UNSIGNED_BYTE, data);
			this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);


			this.flipImage(data, reference.width, reference.height);


			const imageData = new ImageData(new Uint8ClampedArray(data.buffer), reference.width, reference.height);
			this.openImageInNewTab(imageData);
		}*/

		downloadTexture(reference, name) {
			const texture = this._textureManager.getTexture(reference);
			const fb = this._gl.createFramebuffer();
			this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, fb);
			this._gl.framebufferTexture2D(
				this._gl.FRAMEBUFFER, this._gl.COLOR_ATTACHMENT0,
				this._gl.TEXTURE_2D, texture, 0);

			var canvas = document.createElement("canvas");
			canvas.width = reference._width;
			canvas.height = reference._height;
			var ctx = canvas.getContext('2d');
			

			if(reference._type == 22) // FLOAT
			{
				var floatData = new Float32Array(reference._width * reference._height * 4);
				this._gl.readPixels(0, 0, reference._width, reference._height, this._gl.RGBA, this._gl.FLOAT, floatData);
				/*
				for(var i = 0; i < reference._width * reference._height * 4; i++){
					data[i] = Math.floor(floatData[i] * 255.0);
					if(i % 4 == 3) data[i] = 255;
				}*/

				const headerText = "PF\n" + reference._width + " " + reference._height + "\n1.0\n";
				const pfmFile = new ArrayBuffer(headerText.length + (reference._width * reference._height * 3 * 4));
				const view = new DataView(pfmFile);
				for (let i = 0; i < headerText.length; i++) {
					view.setUint8(i, headerText.charCodeAt(i));
				}
				for(var i = 0; i < reference._width * reference._height; i++){
					view.setFloat32(headerText.length + (((i * 3) + 0) * 4), floatData[(i * 4) + 0]);
					view.setFloat32(headerText.length + (((i * 3) + 1) * 4), floatData[(i * 4) + 1]);
					view.setFloat32(headerText.length + (((i * 3) + 2) * 4), floatData[(i * 4) + 2]);
				}
				var binstr = Array.prototype.map.call(new Uint8Array(pfmFile), function (ch) {
					return String.fromCharCode(ch);
				}).join('');
				console.log(binstr)
				var link = document.createElement('a');
				link.download = name+'.pfm';
				link.href = 'data:application/octet-stream;base64,' + btoa(binstr);
				link.click();
			}
			else {
				var data = new Uint8Array(reference._width * reference._height * 4);
				this._gl.readPixels(0, 0, reference._width, reference._height, this._gl.RGBA, this._gl.UNSIGNED_BYTE, data);
			
				this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);
				const imageData = new ImageData(new Uint8ClampedArray(data.buffer), canvas.width, canvas.height);
				ctx.putImageData(imageData, 0, 0, 0, 0, canvas.width, canvas.height);
				var link = document.createElement('a');
				link.download = name+'.png'
				link.href = canvas.toDataURL();

				var clickEvent = document.createEvent("MouseEvent");
				clickEvent.initEvent("click", true, true);

				link.dispatchEvent(clickEvent);
			}
		}

		getAttributeBuffer (attribute) {
				return this._attributeManager.getCachedBuffer(attribute);
		}

		clearAttributeBuffers() {
				this._attributeManager.clearBuffers();
		}

		//region CLEARING FUNCTIONS
		/**
		 * Clears the selected gl buffers with their preset value
		 * @param {boolean} color true if clear, false if not
		 * @param {boolean} depth true if clear, false if not
		 * @param {boolean} stencil true if clear, false if not
		 */
		clear (color, depth, stencil) {
				var bits = 0;

				if ( color === undefined || color ) bits |= this._gl.COLOR_BUFFER_BIT;
				if ( depth === undefined || depth ) bits |= this._gl.DEPTH_BUFFER_BIT;
				if ( stencil === undefined || stencil ) bits |= this._gl.STENCIL_BUFFER_BIT;

				this._gl.clear(bits);
		};

		/**
		 * Sets clear color values
		 * @param r Red
		 * @param g Green
		 * @param b Blue
		 * @param a Alpha
		 */
		setClearColor (r, g, b, a) {
				var color = new Vector4(r, g, b, a);

				if (this._clearColor.equals(color) === false) {
						this._gl.clearColor(r, g, b, a);
						this._clearColor.copy(color);
				}
		};

		/**
		 * Sets depth buffer clear value
		 * @param depth Depth buffer clear value (0 - 1)
		 */
		setClearDepth (depth) {
				if (this._clearDepth !== depth) {
						this._gl.clearDepth(depth);
						this._clearDepth = depth;
				}
		};

		/**
		 * Sets stencil buffer clear value
		 * @param stencil Stencil buffer clear value
		 */
		setClearStencil (stencil) {
				if (this._clearStencil !== stencil) {
						this._gl.clearStencil(stencil);
						this._clearStencil = stencil;
				}
		};

		//endregion


		/**
		 * GETTERS & SETTERS
		 */
		get context () { return this._gl; }

		get glVersion () { return this._glVersion; }

		get cache_programs () { return _ProgramCaching; }

		set cache_programs (enable) { _ProgramCaching = enable; }

		/**
		 * Added by Sebastien
		 */
		get gl(){
				return this._gl;
		}
		get contextAttributes(){
				return this._gl.getContextAttributes();
		}
		imageDataToImage(imagedata) {
			var canvas = document.createElement("canvas");
			var ctx = canvas.getContext("2d");
			canvas.width = imagedata.width;
			canvas.height = imagedata.height;
			ctx.scale(-1.0, 1,0);
			ctx.putImageData(imagedata, 0, 0);
			
		
			var image = new Image();
			image.src = canvas.toDataURL();
			return image;
		}
		flipImage(data, width, height){
			var halfHeight = height / 2 | 0;  // the | 0 keeps the result an int
			var bytesPerRow = width * 4;

			// make a temp buffer to hold one row
			var temp = new Uint8Array(width * 4);
			for (var y = 0; y < halfHeight; ++y) {
				var topOffset = y * bytesPerRow;
				var bottomOffset = (height - y - 1) * bytesPerRow;

				// make copy of a row on the top half
				temp.set(data.subarray(topOffset, topOffset + bytesPerRow));

				// copy a row from the bottom half to the top
				data.copyWithin(topOffset, bottomOffset, bottomOffset + bytesPerRow);

				// copy the copy of the top half row to the bottom half 
				data.set(temp, bottomOffset);
			}
		}
		openImageInNewTab(imageData){
			const w = window.open();
			const image = this.imageDataToImage(imageData);
			image.addEventListener("load", function (){
				if(w){
					w.scrollTo(image.width/2 - w.innerWidth/2, image.height/2 - w.innerHeight/2);
				}else{
					console.warn("Opening of a new tab failed");
				}
			});
			if(w){
				w.document.body.appendChild(image);
			}else{
				console.warn("Opening of a new tab failed");
			}
		}
};