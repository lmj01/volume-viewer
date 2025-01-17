#version 300 es
precision mediump float;

struct Material {
    vec3 diffuse;
    #if (TEXTURE)
        #for I_TEX in 0 to NUM_TEX
            sampler2D texture##I_TEX;
        #end
    #fi
};

uniform Material material;
#if (TRANSPARENT)
uniform float alpha;
#else
float alpha = 1.0;
#fi

#if (LIGHTS && !NO_LIGHTS)

    struct Light {
        bool directional;
        vec3 position;
        vec3 color;
    };

    uniform Light lights[##NUM_LIGHTS];
    uniform vec3 ambient;

    in vec3 fragVPos;
#fi

#if (COLORS)
    in vec4 fragVColor;
#fi

#if (TEXTURE)
    in vec2 fragUV;
#fi

out vec4 color;

#if (CLIPPING_PLANES)
    struct ClippingPlane {
        vec3 normal;
        float constant;
    };

    uniform ClippingPlane clippingPlanes[##NUM_CLIPPING_PLANES];

    in vec3 vViewPosition;
#fi


#if (LIGHTS && !NO_LIGHTS)
    // Calculates the point light color contribution
    vec3 calcPointLight(Light light) {
        // Attenuation
        float distance = length(light.position - fragVPos);
        float attenuation = 1.0f / (1.0f + 0.01f * distance + 0.0001f * (distance * distance));

        // Combine results
        vec3 diffuse = light.color * material.diffuse * attenuation;

        return diffuse;
    }
#fi


void main() {

    #if (CLIPPING_PLANES)
        bool clipped = true;
        for(int i = 0; i < ##NUM_CLIPPING_PLANES; i++){
                clipped = ( dot( vViewPosition, clippingPlanes[i].normal ) > clippingPlanes[i].constant ) && clipped;
        }
        if ( clipped ) discard;
    #fi


    #if (LIGHTS && !NO_LIGHTS)
        color = vec4(0.0, 0.0, 0.0, alpha);

        #for lightIdx in 0 to NUM_LIGHTS
            if (!lights[##lightIdx].directional) {
                color += vec4(calcPointLight(lights[##lightIdx]), 0);
            }
            else {
                color += vec4(lights[##lightIdx].color * material.diffuse, 0);
            }
        #end
    #else
        color = vec4(material.diffuse, alpha);
    #fi

    #if (COLORS)
        color *= fragVColor;
    #fi

    #if (TEXTURE)
        // Apply all of the textures
        #for I_TEX in 0 to NUM_TEX
             color *= texture(material.texture##I_TEX, fragUV);
        #end
    #fi
}