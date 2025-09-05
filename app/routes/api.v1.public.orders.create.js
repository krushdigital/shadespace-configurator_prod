import { ShopifySession } from '../model/shopifySession'

export const action = async ({ request }) => {
    try {
        const body = await request.json();
        const { variantId, quantity = 1, customProperties } = body;

        const sessions = await ShopifySession.find().maxTimeMS(5000);

        if (!sessions || sessions.length === 0) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: 'Not authenticated' 
            }), { status: 401 });
        }

        const session = sessions[0];
        const adminAccessToken = session.accessToken; // This is Admin API token
        const shop = session.shop; // This is myshopify.com domain

        // Get shop domains using Admin API
        const shopResponse = await fetch(`https://${shop}/admin/api/2025-07/graphql.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': adminAccessToken, // Use admin token for admin API
            },
            body: JSON.stringify({
                query: `
                    query {
                        shop {
                            primaryDomain {
                                host
                                url
                            }
                            domains {
                                host
                                url
                            }
                        }
                    }
                `
            })
        });

        const shopData = await shopResponse.json();
        
        if (shopData.errors) {
            console.error('Shop query errors:', shopData.errors);
            return new Response(JSON.stringify({
                success: false,
                error: 'Failed to fetch shop data'
            }), { status: 500 });
        }

        const primaryDomain = shopData.data?.shop?.primaryDomain?.host || shop;

        // Extract variant ID number from GID
        const variantIdNumber = variantId.replace('gid://shopify/ProductVariant/', '');
        
        // Build cart permalink URL with properties
        let cartUrl = `https://${primaryDomain}/cart/${variantIdNumber}:${quantity}`;
        
        // Add line item properties if provided
        if (customProperties && customProperties.length > 0) {
            const properties = customProperties.map(prop => 
                `properties[${encodeURIComponent(prop.key)}]=${encodeURIComponent(prop.value)}`
            ).join('&');
            
            cartUrl += `?${properties}`;
        }

        return new Response(JSON.stringify({
            success: true,
            cartUrl: cartUrl,
            primaryDomain: primaryDomain,
            message: "Cart URL generated successfully"
        }), { status: 200 });

    } catch (error) {
        console.error('Error in create order:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Internal server error'
        }), { status: 500 });
    }
};
