from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad
from base64 import b64decode

# AES256 DECODE
def aes_cbc_base64_dec(key, iv, cipher_text):
    cipher = AES.new(key.encode('utf-8'), AES.MODE_CBC, iv.encode('utf-8'))
    return bytes.decode(unpad(cipher.decrypt(b64decode(cipher_text)), AES.block_size))